/**
 * Tool Filter - Reuses input-style detection for tool arguments/results.
 */

import type { Guardrail, ContentFilterConfig } from './types';
import { inputFilter } from './input-filter';

/**
 * Create a tool guardrail for tool arguments and tool results.
 */
export function toolFilter(config: ContentFilterConfig): Guardrail {
    const base = inputFilter(config);
    return {
        ...base,
        name: 'toolFilter',
        phase: 'tool',
    };
}
