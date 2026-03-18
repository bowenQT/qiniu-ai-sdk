export interface VerificationReportInput {
    generatedAt: string;
    phasePolicySummary?: string;
    phasePolicyAvailable?: boolean;
    capabilityScorecard: string;
    capabilityEvidenceSummary?: string;
    capabilityEvidenceAvailable?: boolean;
    promotionGateSummary?: string;
    promotionGateSummaryAvailable?: boolean;
    liveVerifySummary?: string;
    liveVerifyAvailable: boolean;
    reviewPacket?: string;
    reviewPacketAvailable?: boolean;
    promotionDecisions?: string;
    promotionDecisionsAvailable?: boolean;
    finalPromotionGateSummary?: string;
    finalPromotionGateSummaryAvailable?: boolean;
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

export type FinalPromotionGateDecisionStatus = 'promote' | 'hold' | 'reject' | 'unavailable';

export interface FinalPromotionGateSummaryEntry {
    targetKind: 'prompt' | 'policy' | 'skill';
    targetName: string;
    oldState: string;
    newState: string;
    decisionStatus: FinalPromotionGateDecisionStatus;
    trackedPath?: string;
    decisionSource?: string;
    decisionAt?: string;
    evidenceRefs?: string[];
    blockers?: string[];
    warnings?: string[];
}

export interface FinalPromotionGateEvalCandidateSummary {
    reportId?: string;
    generatedAt?: string;
    baselineId?: string;
    candidateId?: string;
    decision?: string;
    gateStatus?: string;
    blockingFailuresCount?: number;
    warningCount?: number;
    artifactRefs?: string[];
    blockers?: string[];
    warnings?: string[];
}

export interface FinalPromotionGateSummaryInput {
    generatedAt: string;
    packageId?: string;
    policyProfile?: string;
    overallStatus?: CloseoutPromotionGateSummaryEntry['status'];
    decisionFiles?: string[];
    entries: FinalPromotionGateSummaryEntry[];
    evalCandidateReport?: FinalPromotionGateEvalCandidateSummary;
}

export interface FinalPromotionGateSummary extends FinalPromotionGateSummaryInput {
    overallStatus: CloseoutPromotionGateSummaryEntry['status'];
    promptCount: number;
    policyCount: number;
    skillCount: number;
}

export interface CapabilityEvidenceSummaryInput {
    generatedAt?: string;
    decisionFiles?: string[];
    promotionDecisions?: PromotionDecisionSummaryEntry[];
    latestLiveVerifyGate?: {
        path?: string;
        status?: string;
        packageId?: string;
        policyProfile?: string;
        promotionGateStatus?: CloseoutPromotionGateSummaryEntry['status'];
        blockingFailuresCount?: number;
        heldEvidenceCount?: number;
        unavailableEvidenceCount?: number;
    };
}

export interface Phase2CloseoutModuleEntry {
    module: string;
    maturity: string;
    validationLevel?: string;
    decisionStatus: 'held' | 'promoted' | 'untracked';
    trackedPath?: string;
    decisionSource?: string;
    decisionAt?: string;
    deferredRisks?: string[];
}

export interface Phase2PlanningReadinessResult {
    ready: boolean;
    reasons: string[];
}

export interface Phase2CloseoutReportInput {
    generatedAt: string;
    phaseStatus: string;
    allowNewPackages: boolean;
    policyPath?: string;
    closeoutReportPath?: string;
    verificationReportPath?: string;
    closeoutCriteria?: string[];
    overrideRules?: string[];
    promotionGateStatus?: CloseoutPromotionGateSummaryEntry['status'];
    modules: Phase2CloseoutModuleEntry[];
    remainingDeferredRisks: string[];
    readiness: Phase2PlanningReadinessResult;
}

function trimEmbeddedHeading(content: string): string {
    const trimmed = content.trim();
    return trimmed.replace(/^# .+\n+/, '');
}

function hasFinalPromotionGateEvalOutcome(
    evalCandidateReport?: FinalPromotionGateEvalCandidateSummary,
): boolean {
    if (!evalCandidateReport) {
        return false;
    }

    return evalCandidateReport.decision !== undefined
        || evalCandidateReport.gateStatus !== undefined
        || evalCandidateReport.blockingFailuresCount !== undefined
        || evalCandidateReport.warningCount !== undefined
        || (evalCandidateReport.blockers?.length ?? 0) > 0
        || (evalCandidateReport.warnings?.length ?? 0) > 0;
}

function deriveFinalPromotionGateStatus(input: FinalPromotionGateSummaryInput): CloseoutPromotionGateSummaryEntry['status'] {
    if (input.overallStatus) {
        return input.overallStatus;
    }

    if (input.entries.length === 0 && !input.evalCandidateReport) {
        return 'unavailable';
    }

    let sawHold = false;
    let sawUnavailable = false;

    for (const entry of input.entries) {
        if (entry.decisionStatus === 'reject' || entry.blockers?.length) {
            return 'block';
        }
        if (entry.decisionStatus === 'hold' || entry.warnings?.length) {
            sawHold = true;
        }
        if (entry.decisionStatus === 'unavailable') {
            sawUnavailable = true;
        }
    }

    const evalCandidateReport = input.evalCandidateReport;
    if (evalCandidateReport) {
        if (!hasFinalPromotionGateEvalOutcome(evalCandidateReport)) {
            sawUnavailable = true;
        }
        if ((evalCandidateReport.blockingFailuresCount ?? 0) > 0) {
            return 'block';
        }
        if (evalCandidateReport.decision === 'fail' || evalCandidateReport.gateStatus === 'fail') {
            return 'block';
        }
        if ((evalCandidateReport.warningCount ?? 0) > 0 || evalCandidateReport.decision === 'warn' || evalCandidateReport.gateStatus === 'warn') {
            sawHold = true;
        }
    }

    if (sawHold) {
        return 'held';
    }
    if (sawUnavailable) {
        return 'unavailable';
    }
    return 'pass';
}

export function normalizeFinalPromotionGateSummary(input: FinalPromotionGateSummaryInput): FinalPromotionGateSummary {
    const promptCount = input.entries.filter((entry) => entry.targetKind === 'prompt').length;
    const policyCount = input.entries.filter((entry) => entry.targetKind === 'policy').length;
    const skillCount = input.entries.filter((entry) => entry.targetKind === 'skill').length;
    return {
        ...input,
        overallStatus: deriveFinalPromotionGateStatus(input),
        promptCount,
        policyCount,
        skillCount,
    };
}

function renderFinalPromotionGateEntry(entry: FinalPromotionGateSummaryEntry): string[] {
    return [
        `### ${entry.targetName}`,
        '',
        `- Target kind: ${entry.targetKind}`,
        entry.oldState === entry.newState
            ? `- State: ${entry.newState} (unchanged)`
            : `- State: ${entry.oldState} -> ${entry.newState}`,
        `- Decision: ${entry.decisionStatus}`,
        ...(entry.decisionSource ? [`- Source: ${entry.decisionSource}`] : []),
        ...(entry.decisionAt ? [`- Decision at: ${entry.decisionAt}`] : []),
        ...(entry.trackedPath ? [`- Tracked file: ${entry.trackedPath}`] : []),
        ...(entry.evidenceRefs && entry.evidenceRefs.length > 0
            ? [
                '- Evidence:',
                ...entry.evidenceRefs.map((ref) => `  - ${ref}`),
            ]
            : []),
        ...(entry.blockers && entry.blockers.length > 0
            ? [
                '- Blockers:',
                ...entry.blockers.map((blocker) => `  - ${blocker}`),
            ]
            : []),
        ...(entry.warnings && entry.warnings.length > 0
            ? [
                '- Warnings:',
                ...entry.warnings.map((warning) => `  - ${warning}`),
            ]
            : []),
        '',
    ];
}

function renderFinalPromotionGateEntries(
    entries: FinalPromotionGateSummaryEntry[],
    targetKind: FinalPromotionGateSummaryEntry['targetKind'],
    emptyMessage: string,
): string[] {
    const filtered = entries.filter((entry) => entry.targetKind === targetKind);
    if (filtered.length === 0) {
        return [emptyMessage, ''];
    }

    return filtered.flatMap((entry) => renderFinalPromotionGateEntry(entry));
}

export function renderFinalPromotionGateSummary(input: FinalPromotionGateSummaryInput): string {
    const summary = normalizeFinalPromotionGateSummary(input);
    const evalCandidateReport = hasFinalPromotionGateEvalOutcome(summary.evalCandidateReport)
        ? summary.evalCandidateReport
        : undefined;
    const evalCandidateReportLines = evalCandidateReport
        ? [
            evalCandidateReport.reportId ? `- Report: ${evalCandidateReport.reportId}` : undefined,
            evalCandidateReport.generatedAt ? `- Generated at: ${evalCandidateReport.generatedAt}` : undefined,
            evalCandidateReport.baselineId ? `- Baseline: ${evalCandidateReport.baselineId}` : undefined,
            evalCandidateReport.candidateId ? `- Candidate: ${evalCandidateReport.candidateId}` : undefined,
            evalCandidateReport.decision ? `- Decision: ${evalCandidateReport.decision}` : undefined,
            evalCandidateReport.gateStatus ? `- Gate status: ${evalCandidateReport.gateStatus}` : undefined,
            `- Blocking failures: ${evalCandidateReport.blockingFailuresCount ?? 0}`,
            `- Warnings: ${evalCandidateReport.warningCount ?? 0}`,
            ...(evalCandidateReport.blockers && evalCandidateReport.blockers.length > 0
                ? [
                    'Blocking reasons:',
                    ...evalCandidateReport.blockers.map((blocker) => `- ${blocker}`),
                ]
                : []),
            ...(evalCandidateReport.warnings && evalCandidateReport.warnings.length > 0
                ? [
                    'Warnings:',
                    ...evalCandidateReport.warnings.map((warning) => `- ${warning}`),
                ]
                : []),
            ...(evalCandidateReport.artifactRefs && evalCandidateReport.artifactRefs.length > 0
                ? [
                    'Artifact refs:',
                    ...evalCandidateReport.artifactRefs.map((ref) => `- ${ref}`),
                ]
                : []),
        ].filter((line): line is string => line !== undefined)
        : ['No eval candidate report was provided.'];

    return [
        '# Final Promotion Gate Summary',
        '',
        `Generated at: ${summary.generatedAt}`,
        `- Overall status: ${summary.overallStatus}`,
        ...(summary.packageId ? [`- Package: ${summary.packageId}`] : []),
        ...(summary.policyProfile ? [`- Policy profile: ${summary.policyProfile}`] : []),
        `- Prompt decisions: ${summary.promptCount}`,
        `- Policy decisions: ${summary.policyCount}`,
        `- Skill promotions: ${summary.skillCount}`,
        ...(summary.decisionFiles && summary.decisionFiles.length > 0
            ? [
                '',
                'Decision files:',
                ...summary.decisionFiles.map((filePath) => `- ${filePath}`),
            ]
            : []),
        '',
        '## Eval Candidate Report',
        '',
        ...evalCandidateReportLines,
        '',
        '## Prompt Decisions',
        '',
        ...renderFinalPromotionGateEntries(
            summary.entries,
            'prompt',
            'No prompt promotion decisions were recorded.',
        ),
        '## Policy Decisions',
        '',
        ...renderFinalPromotionGateEntries(
            summary.entries,
            'policy',
            'No policy promotion decisions were recorded.',
        ),
        '## Skill Promotions',
        '',
        ...renderFinalPromotionGateEntries(
            summary.entries,
            'skill',
            'No skill promotion decisions were recorded.',
        ),
    ].join('\n');
}

export function toFinalPromotionGateSummaryJson(input: FinalPromotionGateSummaryInput): string {
    return JSON.stringify(normalizeFinalPromotionGateSummary(input), null, 2) + '\n';
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

export function renderCapabilityEvidenceSummary(snapshot: CapabilityEvidenceSummaryInput): string {
    const decisionFiles = Array.isArray(snapshot.decisionFiles) ? snapshot.decisionFiles : [];
    const promotionDecisions = Array.isArray(snapshot.promotionDecisions) ? snapshot.promotionDecisions : [];
    const latestGate = snapshot.latestLiveVerifyGate;
    return [
        '# Capability Evidence Snapshot',
        '',
        `Generated at: ${snapshot.generatedAt ?? 'unknown'}`,
        `Tracked decision files: ${decisionFiles.length}`,
        ...(decisionFiles.length > 0
            ? [
                '',
                'Decision files:',
                ...decisionFiles.map((filePath) => `- ${filePath}`),
            ]
            : []),
        '',
        `Tracked promotion decisions: ${promotionDecisions.length}`,
        ...(promotionDecisions.length > 0
            ? [
                '',
                'Decision records:',
                ...promotionDecisions.map((decision) => {
                    const maturity =
                        decision.oldMaturity === decision.newMaturity
                            ? `${decision.newMaturity} (held)`
                            : `${decision.oldMaturity} -> ${decision.newMaturity}`;
                    return `- ${decision.module}: ${maturity} [${decision.trackedPath ?? 'untracked'}]`;
                }),
            ]
            : []),
        ...(latestGate
            ? [
                '',
                'Latest gate artifact:',
                `- Path: ${latestGate.path ?? 'unknown'}`,
                `- Status: ${latestGate.status ?? 'unknown'}`,
                `- Promotion gate: ${latestGate.promotionGateStatus ?? 'unknown'}`,
                `- Blocking failures: ${latestGate.blockingFailuresCount ?? 0}`,
                `- Held evidence: ${latestGate.heldEvidenceCount ?? 0}`,
                `- Unavailable evidence: ${latestGate.unavailableEvidenceCount ?? 0}`,
                ...(latestGate.packageId ? [`- Package: ${latestGate.packageId}`] : []),
            ]
            : []),
        '',
    ].join('\n');
}

export function evaluatePhase2PlanningReadiness(options: {
    phaseStatus: string;
    allowNewPackages: boolean;
    promotionGateStatus?: CloseoutPromotionGateSummaryEntry['status'];
    modules: Phase2CloseoutModuleEntry[];
}): Phase2PlanningReadinessResult {
    const reasons: string[] = [];
    if (options.phaseStatus === 'active') {
        reasons.push('Phase 2 policy is still active.');
    }
    if (options.allowNewPackages) {
        reasons.push('Phase 2 policy still allows new packages.');
    }
    if (options.promotionGateStatus === 'block') {
        reasons.push('Latest promotion gate status is block.');
    }
    for (const entry of options.modules) {
        if (entry.decisionStatus === 'untracked') {
            reasons.push(`Missing tracked promotion decision for ${entry.module}.`);
        }
    }
    return {
        ready: reasons.length === 0,
        reasons,
    };
}

export function renderPhase2CloseoutReport(input: Phase2CloseoutReportInput): string {
    return [
        '# Phase 2 Closeout Report',
        '',
        `Generated at: ${input.generatedAt}`,
        '',
        'This artifact summarizes the tracked closeout state for Phase 2 so release owners and antigravity can decide whether the repository should stop opening Phase 2 packages and move to Phase 3 planning.',
        '',
        '## Phase Policy',
        '',
        `- Status: ${input.phaseStatus}`,
        `- New packages allowed: ${input.allowNewPackages ? 'yes' : 'no'}`,
        ...(input.policyPath ? [`- Policy path: ${input.policyPath}`] : []),
        ...(input.closeoutReportPath ? [`- Closeout report path: ${input.closeoutReportPath}`] : []),
        ...(input.verificationReportPath ? [`- Verification report path: ${input.verificationReportPath}`] : []),
        ...(input.closeoutCriteria && input.closeoutCriteria.length > 0
            ? [
                '',
                'Closeout criteria:',
                ...input.closeoutCriteria.map((criterion) => `- ${criterion}`),
            ]
            : []),
        ...(input.overrideRules && input.overrideRules.length > 0
            ? [
                '',
                'Override rules:',
                ...input.overrideRules.map((rule) => `- ${rule}`),
            ]
            : []),
        '',
        '## Promotion-sensitive Modules',
        '',
        ...(input.modules.length > 0
            ? input.modules.flatMap((entry) => [
                `### ${entry.module}`,
                '',
                `- Maturity: ${entry.maturity}`,
                `- Validation: ${entry.validationLevel ?? 'unknown'}`,
                `- Decision: ${entry.decisionStatus}`,
                ...(entry.decisionSource ? [`- Decision source: ${entry.decisionSource}`] : []),
                ...(entry.decisionAt ? [`- Decision at: ${entry.decisionAt}`] : []),
                ...(entry.trackedPath ? [`- Tracked decision: ${entry.trackedPath}`] : []),
                ...(entry.deferredRisks && entry.deferredRisks.length > 0
                    ? [
                        '- Deferred risks:',
                        ...entry.deferredRisks.map((risk) => `  - ${risk}`),
                    ]
                    : []),
                '',
            ])
            : ['No promotion-sensitive modules were identified for Phase 2.', '']),
        '## Remaining Deferred Risks',
        '',
        ...(input.remainingDeferredRisks.length > 0
            ? input.remainingDeferredRisks.map((risk) => `- ${risk}`)
            : ['- No remaining deferred risks recorded.']),
        '',
        '## Phase 3 Planning Readiness',
        '',
        `- Ready: ${input.readiness.ready ? 'yes' : 'no'}`,
        ...(input.promotionGateStatus ? [`- Latest promotion gate status: ${input.promotionGateStatus}`] : []),
        ...(input.readiness.reasons.length > 0
            ? [
                '',
                'Blocking reasons:',
                ...input.readiness.reasons.map((reason) => `- ${reason}`),
            ]
            : [
                '',
                'Blocking reasons:',
                '- None. Phase 2 is ready to move into Phase 3 planning.',
            ]),
        '',
    ].join('\n');
}

export function renderVerificationReport(input: VerificationReportInput): string {
    const capabilityScorecard = trimEmbeddedHeading(input.capabilityScorecard);
    const phasePolicySummary = input.phasePolicySummary ? trimEmbeddedHeading(input.phasePolicySummary) : undefined;
    const capabilityEvidenceSummary = input.capabilityEvidenceSummary
        ? trimEmbeddedHeading(input.capabilityEvidenceSummary)
        : undefined;
    const promotionGateSummary = input.promotionGateSummary
        ? trimEmbeddedHeading(input.promotionGateSummary)
        : undefined;
    const liveVerifySummary = input.liveVerifySummary ? trimEmbeddedHeading(input.liveVerifySummary) : undefined;
    const reviewPacket = input.reviewPacket ? trimEmbeddedHeading(input.reviewPacket) : undefined;
    const promotionDecisions = input.promotionDecisions
        ? trimEmbeddedHeading(input.promotionDecisions)
        : undefined;
    const finalPromotionGateSummary = input.finalPromotionGateSummary
        ? trimEmbeddedHeading(input.finalPromotionGateSummary)
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
        '## Promotion Gate Summary',
        '',
        input.promotionGateSummaryAvailable && promotionGateSummary
            ? promotionGateSummary
            : 'Promotion gate summary was not produced for this run.',
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
        '## Final Promotion Gate Summary',
        '',
        input.finalPromotionGateSummaryAvailable && finalPromotionGateSummary
            ? finalPromotionGateSummary
            : 'Final promotion gate summary was not produced for this run.',
        '',
    ].join('\n');
}
