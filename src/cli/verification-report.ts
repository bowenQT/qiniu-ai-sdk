export interface VerificationReportInput {
    generatedAt: string;
    phasePolicySummary?: string;
    phasePolicyAvailable?: boolean;
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

export interface PromotionDecisionSummaryEntry {
    module: string;
    oldMaturity: string;
    newMaturity: string;
    trackedPath?: string;
    decisionSource?: string;
    decisionAt?: string;
}

export interface CloseoutPromotionGateSummaryEntry {
    status: 'pass' | 'held' | 'block' | 'unavailable';
    packageId?: string;
    policyProfile?: string;
    blockingFailuresCount?: number;
    heldEvidenceCount?: number;
    unavailableEvidenceCount?: number;
}

function trimEmbeddedHeading(content: string): string {
    const trimmed = content.trim();
    return trimmed.replace(/^# .+\n+/, '');
}

export function renderReviewPacketFallback(options?: {
    handoffPath?: string;
    handoffContent?: string;
}): string {
    const handoffContent = options?.handoffContent?.trim();
    if (handoffContent) {
        return handoffContent.endsWith('\n') ? handoffContent : `${handoffContent}\n`;
    }
    if (options?.handoffPath) {
        return [
            '# Review Packet',
            '',
            `Tracked review handoff: ${options.handoffPath}`,
            '',
        ].join('\n');
    }
    return [
        '# Review Packet',
        '',
        'No package-scoped review packet inputs were provided for this run.',
        '',
    ].join('\n');
}

export function renderPromotionDecisionSummary(
    decisions: PromotionDecisionSummaryEntry[],
): string {
    const lines = ['# Promotion Decisions', ''];
    if (decisions.length === 0) {
        lines.push('No promotion decisions recorded.', '');
        return lines.join('\n');
    }
    for (const decision of decisions) {
        lines.push(`## ${decision.module}`);
        lines.push('');
        lines.push(
            decision.oldMaturity === decision.newMaturity
                ? `- Maturity: ${decision.newMaturity} (held)`
                : `- Maturity: ${decision.oldMaturity} -> ${decision.newMaturity}`,
        );
        if (decision.decisionSource) {
            lines.push(`- Source: ${decision.decisionSource}`);
        }
        if (decision.decisionAt) {
            lines.push(`- Decision at: ${decision.decisionAt}`);
        }
        if (decision.trackedPath) {
            lines.push(`- Tracked file: ${decision.trackedPath}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

export function renderPromotionGateSummary(entry?: CloseoutPromotionGateSummaryEntry): string {
    if (!entry) {
        return [
            '# Promotion Gate Summary',
            '',
            'No live-verify promotion gate artifact was produced for this run.',
            '',
        ].join('\n');
    }
    return [
        '# Promotion Gate Summary',
        '',
        `- Status: ${entry.status}`,
        ...(entry.packageId ? [`- Package: ${entry.packageId}`] : []),
        ...(entry.policyProfile ? [`- Policy profile: ${entry.policyProfile}`] : []),
        `- Blocking failures: ${entry.blockingFailuresCount ?? 0}`,
        `- Held evidence: ${entry.heldEvidenceCount ?? 0}`,
        `- Unavailable evidence: ${entry.unavailableEvidenceCount ?? 0}`,
        '',
    ].join('\n');
}

export function renderVerificationReport(input: VerificationReportInput): string {
    const capabilityScorecard = trimEmbeddedHeading(input.capabilityScorecard);
    const phasePolicySummary = input.phasePolicySummary ? trimEmbeddedHeading(input.phasePolicySummary) : undefined;
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
        'This artifact combines tracked capability truth, package review artifacts, tracked promotion decisions, and the latest live verification evidence and policy boundaries produced in CI.',
        '',
        '## Phase Policy',
        '',
        input.phasePolicyAvailable && phasePolicySummary
            ? phasePolicySummary
            : 'Phase policy summary was not produced for this run.',
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
