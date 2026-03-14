import type { ModelInfo } from '../models';

export type ModuleMaturity = 'ga' | 'beta' | 'experimental';
export type ValidationLevel = 'static' | 'unit' | 'contract' | 'live';
export type CapabilityType = 'chat' | 'image' | 'video';

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
}

export interface ListModelsOptions {
    type?: CapabilityType;
    provider?: string;
    stability?: ModuleMaturity;
}
