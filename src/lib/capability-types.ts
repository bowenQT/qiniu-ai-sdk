import type { ModelInfo } from '../models';

export type ModuleMaturity = 'ga' | 'beta' | 'experimental';
export type ValidationLevel = 'static' | 'unit' | 'contract' | 'live';
export type CapabilityType = 'chat' | 'image' | 'video';

export interface TrackedPromotionDecisionInfo {
    packageId: string;
    module: string;
    oldMaturity: ModuleMaturity;
    newMaturity: ModuleMaturity;
    evidenceBasis: readonly string[];
    decisionSource: string;
    decisionAt: string;
    trackedPath?: string;
}

export interface LiveVerifyGateEvidenceInfo {
    path?: string;
    generatedAt?: string;
    status?: 'ok' | 'warn' | 'fail';
    exitCode?: 0 | 1 | 2;
    policyProfile?: string;
    packageId?: string;
    packageCategory?: 'standard' | 'promotion-sensitive';
    promotionGateStatus?: 'pass' | 'held' | 'block' | 'unavailable';
    blockingFailuresCount?: number;
    heldEvidenceCount?: number;
    unavailableEvidenceCount?: number;
}

export interface ModelCapabilityInfo extends ModelInfo {
    docsUrl: string;
    sourceUpdatedAt: string;
    stability: ModuleMaturity;
    validatedAt?: string;
    validationLevel: ValidationLevel;
}

export interface ModuleMaturityInfo {
    name: string;
    maturity: ModuleMaturity;
    docsUrl: string;
    sourceUpdatedAt: string;
    validatedAt?: string;
    validationLevel: ValidationLevel;
    notes?: string;
    trackedDecision?: TrackedPromotionDecisionInfo;
}

export interface ListModelsOptions {
    type?: CapabilityType;
    provider?: string;
    stability?: ModuleMaturity;
}
