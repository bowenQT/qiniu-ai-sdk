import { describe, expect, it } from 'vitest';
import { renderVerificationReport } from '../../src/cli/verification-report';

describe('verification report renderer', () => {
    it('combines the capability scorecard and live verification summary', () => {
        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            liveVerifyAvailable: true,
            liveVerifySummary: '# Live Verification Gate\n\nLatest live evidence.\n',
            reviewPacketAvailable: true,
            reviewPacket: '# Review Packet\n\nBounded package summary.\n',
            promotionDecisionsAvailable: true,
            promotionDecisions: '# Promotion Decisions\n\nRecorded maturity changes.\n',
        });

        expect(output).toContain('# Verification Report');
        expect(output).toContain('Generated at: 2026-03-16T00:00:00.000Z');
        expect(output).toContain('## Capability Scorecard');
        expect(output).toContain('Tracked capability truth.');
        expect(output).toContain('## Live Verification');
        expect(output).toContain('Latest live evidence.');
        expect(output).toContain('## Review Packet');
        expect(output).toContain('Bounded package summary.');
        expect(output).toContain('## Promotion Decisions');
        expect(output).toContain('Recorded maturity changes.');
        expect(output).not.toContain('## Capability Scorecard\n\n# Capability Scorecard');
        expect(output).not.toContain('## Live Verification\n\n# Live Verification Gate');
        expect(output).not.toContain('## Review Packet\n\n# Review Packet');
    });

    it('renders fallback messages when optional artifacts do not exist', () => {
        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            liveVerifyAvailable: false,
            reviewPacketAvailable: false,
            promotionDecisionsAvailable: false,
        });

        expect(output).toContain('Live verification artifact was not produced for this run.');
        expect(output).toContain('Review packet artifact was not produced for this run.');
        expect(output).toContain('Promotion decision artifact was not produced for this run.');
    });
});
