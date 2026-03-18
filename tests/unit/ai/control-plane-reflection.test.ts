import { describe, expect, it } from 'vitest';
import {
    estimateTextDiffRatio,
    runBoundedReflectionLoop,
    type CriticPolicy,
    type VerifierPolicy,
} from '../../../src/ai/control-plane';

describe('control-plane bounded reflection', () => {
    it('computes zero diff for identical texts', () => {
        expect(estimateTextDiffRatio('same', 'same')).toBe(0);
    });

    it('stops when verifier passes', async () => {
        const criticPolicy: CriticPolicy = {
            critique: ({ currentText }) => ({
                revisedText: `${currentText} improved`,
                rationale: 'Tighten wording.',
                estimatedCost: 0.2,
            }),
        };
        const verifierPolicy: VerifierPolicy = {
            verify: ({ currentText }) => ({
                status: currentText.includes('improved') ? 'pass' : 'fail',
                rationale: 'Looks good.',
                estimatedCost: 0.1,
            }),
        };

        const result = await runBoundedReflectionLoop({
            text: 'draft',
            criticPolicy,
            verifierPolicy,
        });

        expect(result.stopReason).toBe('verifier-passed');
        expect(result.finalText).toBe('draft improved');
        expect(result.traceSteps).toHaveLength(2);
    });

    it('prefers verifier-passed when the critic makes no further changes', async () => {
        const criticPolicy: CriticPolicy = {
            critique: ({ currentText }) => ({
                revisedText: currentText,
                rationale: 'No edits required.',
            }),
        };
        const verifierPolicy: VerifierPolicy = {
            verify: () => ({
                status: 'pass',
                rationale: 'Current draft already satisfies the verifier.',
            }),
        };

        const result = await runBoundedReflectionLoop({
            text: 'final draft',
            criticPolicy,
            verifierPolicy,
        });

        expect(result.stopReason).toBe('verifier-passed');
        expect(result.finalText).toBe('final draft');
    });

    it('stops on convergence after repeated low-diff revisions', async () => {
        let count = 0;
        const criticPolicy: CriticPolicy = {
            critique: ({ currentText }) => {
                count += 1;
                return {
                    revisedText: count === 1 ? `${currentText}!` : `${currentText} `,
                    diffRatio: 0.01,
                };
            },
        };
        const verifierPolicy: VerifierPolicy = {
            verify: () => ({
                status: 'warn',
            }),
        };

        const result = await runBoundedReflectionLoop({
            text: 'draft',
            criticPolicy,
            verifierPolicy,
            limits: {
                maxIterations: 5,
                diffThreshold: 0.05,
            },
        });

        expect(result.stopReason).toBe('converged');
        expect(result.iterations).toHaveLength(2);
    });

    it('stops when estimated cost exceeds the cap', async () => {
        const criticPolicy: CriticPolicy = {
            critique: ({ currentText }) => ({
                revisedText: `${currentText} v2`,
                estimatedCost: 2,
            }),
        };
        const verifierPolicy: VerifierPolicy = {
            verify: () => ({
                status: 'fail',
                estimatedCost: 2,
            }),
        };

        const result = await runBoundedReflectionLoop({
            text: 'draft',
            criticPolicy,
            verifierPolicy,
            limits: {
                maxEstimatedCost: 1,
            },
        });

        expect(result.stopReason).toBe('cost-cap');
        expect(result.totalEstimatedCost).toBeGreaterThan(1);
    });
});
