/**
 * Skill reference injection modes.
 * 
 * Controls how skill references are injected into prompts.
 * - none: Only instruction, no references
 * - summary: Instruction + file listing (path only)
 * - full: Instruction + full reference content
 *
 * @module
 */

import { defaultContentEstimator } from '../../lib/token-estimator';

// ============================================================================
// Types
// ============================================================================

export type ReferenceMode = 'none' | 'summary' | 'full';

export interface SkillInput {
    instruction: string;
    references?: Array<{ path: string; content: string }>;
}

export interface ReferenceModeResult {
    /** Final injected content */
    injectedContent: string;
    /** Runtime token count of injected content */
    injectedTokenCount: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Apply reference mode to a skill and produce final injected content.
 */
export function applyReferenceMode(
    skill: SkillInput,
    mode: ReferenceMode,
): ReferenceModeResult {
    const refs = skill.references ?? [];
    let injectedContent: string;

    switch (mode) {
        case 'none':
            injectedContent = skill.instruction;
            break;

        case 'summary':
            if (refs.length === 0) {
                injectedContent = skill.instruction;
            } else {
                const listing = refs.map(r => `- ${r.path}`).join('\n');
                injectedContent = `${skill.instruction}\n\n## References\n${listing}`;
            }
            break;

        case 'full':
            if (refs.length === 0) {
                injectedContent = skill.instruction;
            } else {
                const fullRefs = refs
                    .map(r => `### ${r.path}\n${r.content}`)
                    .join('\n\n');
                injectedContent = `${skill.instruction}\n\n## References\n${fullRefs}`;
            }
            break;

        default:
            injectedContent = skill.instruction;
    }

    return {
        injectedContent,
        injectedTokenCount: defaultContentEstimator(injectedContent),
    };
}
