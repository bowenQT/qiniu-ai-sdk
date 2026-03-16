export interface VerificationReportInput {
    generatedAt: string;
    capabilityScorecard: string;
    capabilityEvidenceSummary?: string;
    capabilityEvidenceAvailable?: boolean;
    liveVerifySummary?: string;
    liveVerifyAvailable: boolean;
    reviewPacket?: string;
    reviewPacketAvailable?: boolean;
    promotionDecisions?: string;
    promotionDecisionsAvailable?: boolean;
}

function trimEmbeddedHeading(content: string): string {
    const trimmed = content.trim();
    return trimmed.replace(/^# .+\n+/, '');
}

export function renderVerificationReport(input: VerificationReportInput): string {
    const capabilityScorecard = trimEmbeddedHeading(input.capabilityScorecard);
    const capabilityEvidenceSummary = input.capabilityEvidenceSummary
        ? trimEmbeddedHeading(input.capabilityEvidenceSummary)
        : undefined;
    const liveVerifySummary = input.liveVerifySummary ? trimEmbeddedHeading(input.liveVerifySummary) : undefined;
    const reviewPacket = input.reviewPacket ? trimEmbeddedHeading(input.reviewPacket) : undefined;
    const promotionDecisions = input.promotionDecisions
        ? trimEmbeddedHeading(input.promotionDecisions)
        : undefined;

    return [
        '# Verification Report',
        '',
        `Generated at: ${input.generatedAt}`,
        '',
        'This artifact combines tracked capability truth, package review artifacts, promotion decisions, and the latest live verification evidence produced in CI.',
        '',
        '## Capability Scorecard',
        '',
        capabilityScorecard,
        '',
        '## Capability Evidence Snapshot',
        '',
        input.capabilityEvidenceAvailable && capabilityEvidenceSummary
            ? capabilityEvidenceSummary
            : 'Capability evidence snapshot was not produced for this run.',
        '',
        '## Live Verification',
        '',
        input.liveVerifyAvailable && liveVerifySummary
            ? liveVerifySummary
            : 'Live verification artifact was not produced for this run.',
        '',
        '## Review Packet',
        '',
        input.reviewPacketAvailable && reviewPacket
            ? reviewPacket
            : 'Review packet artifact was not produced for this run.',
        '',
        '## Promotion Decisions',
        '',
        input.promotionDecisionsAvailable && promotionDecisions
            ? promotionDecisions
            : 'Promotion decision artifact was not produced for this run.',
        '',
    ].join('\n');
}
