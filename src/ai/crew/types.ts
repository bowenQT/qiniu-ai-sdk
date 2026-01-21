/**
 * Crew Types - Multi-Agent Orchestration.
 */

import type { Agent } from '../create-agent';

// ============================================================================
// Orchestration Modes
// ============================================================================

/**
 * Orchestration mode for crew execution.
 */
export type OrchestrationMode = 'sequential' | 'parallel' | 'hierarchical';

// ============================================================================
// Crew Configuration
// ============================================================================

/**
 * Crew configuration.
 */
export interface CrewConfig {
    /** Agents in the crew */
    agents: Agent[];
    /** Orchestration mode */
    orchestration: OrchestrationMode;
    /** Manager agent for hierarchical mode (optional) */
    manager?: Agent;
    /** Verbose logging */
    verbose?: boolean;
}

// ============================================================================
// Kickoff Options
// ============================================================================

/**
 * Options for crew kickoff.
 */
export interface CrewKickoffOptions {
    /** Initial task description */
    task: string;
    /** Context to pass to agents */
    context?: Record<string, unknown>;
    /** Abort signal */
    abortSignal?: AbortSignal;
}

// ============================================================================
// Agent Result
// ============================================================================

/**
 * Result from a single agent execution.
 */
export interface AgentResult {
    /** Agent ID */
    agentId: string;
    /** Agent output text */
    output: string;
    /** Execution time in ms */
    durationMs: number;
    /** Success flag */
    success: boolean;
    /** Error if failed */
    error?: Error;
}

// ============================================================================
// Crew Result
// ============================================================================

/**
 * Result from crew execution.
 */
export interface CrewResult {
    /** Final output from the crew */
    output: string;
    /** Results from each agent */
    agentResults: AgentResult[];
    /** Total execution time in ms */
    totalDurationMs: number;
    /** Orchestration mode used */
    orchestration: OrchestrationMode;
}

// ============================================================================
// Crew Instance
// ============================================================================

/**
 * Crew instance.
 */
export interface Crew {
    /** Kickoff the crew with a task */
    kickoff: (options: CrewKickoffOptions) => Promise<CrewResult>;
    /** Get agents in the crew */
    getAgents: () => Agent[];
}
