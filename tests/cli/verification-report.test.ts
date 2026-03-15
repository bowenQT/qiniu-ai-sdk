import { describe, expect, it } from 'vitest';
import { renderVerificationReport } from '../../src/cli/verification-report';

describe('verification report renderer', () => {
    it('combines the capability scorecard and live verification summary', () => {
        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            liveVerifyAvailable: true,
            liveVerifySummary: '# Live Verification Gate\n\nLatest live evidence.\n',
        });

        expect(output).toContain('# Verification Report');
        expect(output).toContain('Generated at: 2026-03-16T00:00:00.000Z');
        expect(output).toContain('## Capability Scorecard');
        expect(output).toContain('Tracked capability truth.');
        expect(output).toContain('## Live Verification');
        expect(output).toContain('Latest live evidence.');
        expect(output).not.toContain('## Capability Scorecard\n\n# Capability Scorecard');
        expect(output).not.toContain('## Live Verification\n\n# Live Verification Gate');
    });

    it('renders a fallback message when no live verification artifact exists', () => {
        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            liveVerifyAvailable: false,
        });

        expect(output).toContain('Live verification artifact was not produced for this run.');
    });
});
