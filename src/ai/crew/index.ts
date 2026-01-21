/**
 * Crew Module - Multi-Agent Orchestration.
 */

// Types
export type {
    OrchestrationMode,
    CrewConfig,
    CrewKickoffOptions,
    AgentResult,
    CrewResult,
    Crew,
} from './types';

// Factory
export { createSequentialCrew } from './sequential';
export { createParallelCrew } from './parallel';
export { createHierarchicalCrew } from './hierarchical';

// ============================================================================
// createCrew Factory
// ============================================================================

import type { CrewConfig, Crew } from './types';
import { createSequentialCrew } from './sequential';
import { createParallelCrew } from './parallel';
import { createHierarchicalCrew } from './hierarchical';

/**
 * Create a crew with the specified orchestration mode.
 * 
 * @example
 * ```typescript
 * const crew = createCrew({
 *     agents: [researcher, writer],
 *     orchestration: 'sequential',
 * });
 * 
 * const result = await crew.kickoff({ task: 'Write blog post' });
 * ```
 */
export function createCrew(config: CrewConfig): Crew {
    switch (config.orchestration) {
        case 'sequential':
            return createSequentialCrew(config);
        case 'parallel':
            return createParallelCrew(config);
        case 'hierarchical':
            return createHierarchicalCrew(config);
        default:
            throw new Error(`Unknown orchestration mode: ${config.orchestration}`);
    }
}
