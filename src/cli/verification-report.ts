export interface VerificationReportInput {
    generatedAt: string;
    capabilityScorecard: string;
    liveVerifySummary?: string;
    liveVerifyAvailable: boolean;
}

function trimEmbeddedHeading(content: string): string {
    const trimmed = content.trim();
    return trimmed.replace(/^# .+\n+/, '');
}

export function renderVerificationReport(input: VerificationReportInput): string {
    const capabilityScorecard = trimEmbeddedHeading(input.capabilityScorecard);
    const liveVerifySummary = input.liveVerifySummary ? trimEmbeddedHeading(input.liveVerifySummary) : undefined;

    return [
        '# Verification Report',
        '',
        `Generated at: ${input.generatedAt}`,
        '',
        'This artifact combines the tracked capability scorecard with the latest live verification evidence produced in CI.',
        '',
        '## Capability Scorecard',
        '',
        capabilityScorecard,
        '',
        '## Live Verification',
        '',
        input.liveVerifyAvailable && liveVerifySummary
            ? liveVerifySummary
            : 'Live verification artifact was not produced for this run.',
        '',
    ].join('\n');
}
