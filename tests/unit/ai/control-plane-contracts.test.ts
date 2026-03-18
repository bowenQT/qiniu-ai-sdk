import { describe, expect, it } from 'vitest';
import {
    CONTROL_PLANE_ARTIFACT_KINDS,
    CONTROL_PLANE_ARTIFACT_LABELS,
    createRevisionRef,
    isArtifactLabel,
    isControlPlaneArtifactKind,
    normalizeArtifactLabels,
} from '../../../src/ai/control-plane';

describe('control-plane contracts', () => {
    it('exposes the stable artifact kinds and labels needed by downstream packages', () => {
        expect(CONTROL_PLANE_ARTIFACT_KINDS).toEqual([
            'prompt',
            'tool-contract',
            'routing-policy',
            'memory-policy',
            'guardrail-policy',
            'skill',
        ]);
        expect(CONTROL_PLANE_ARTIFACT_LABELS).toEqual([
            'candidate',
            'staging',
            'production',
            'archived',
        ]);
    });

    it('recognizes valid labels and artifact kinds', () => {
        expect(isArtifactLabel('candidate')).toBe(true);
        expect(isArtifactLabel('beta')).toBe(false);
        expect(isControlPlaneArtifactKind('prompt')).toBe(true);
        expect(isControlPlaneArtifactKind('session')).toBe(false);
    });

    it('normalizes labels to stable order without invalid values', () => {
        expect(normalizeArtifactLabels([
            'production',
            'candidate',
            'unknown',
            'staging',
            'candidate',
        ])).toEqual([
            'candidate',
            'staging',
            'production',
        ]);
    });

    it('creates revision refs with normalized labels', () => {
        expect(createRevisionRef({
            kind: 'prompt',
            revisionId: 'rev_123',
            labels: ['production', 'candidate', 'bogus'],
            createdAt: '2026-03-18T00:00:00.000Z',
            metadata: { owner: 'runtime' },
        })).toEqual({
            kind: 'prompt',
            revisionId: 'rev_123',
            labels: ['candidate', 'production'],
            createdAt: '2026-03-18T00:00:00.000Z',
            metadata: { owner: 'runtime' },
        });
    });
});
