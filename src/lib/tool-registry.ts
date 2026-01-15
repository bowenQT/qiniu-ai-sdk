/**
 * Tool Registry for managing tool registration with conflict resolution.
 * Implements priority-based registration: user > skill > mcp > builtin
 */

import type { Logger } from './logger';
import { noopLogger } from './logger';

/** Tool source types in priority order */
export type ToolSourceType = 'user' | 'skill' | 'mcp' | 'builtin';

/** Priority order (lower index = higher priority) */
const SOURCE_PRIORITY: ToolSourceType[] = ['user', 'skill', 'mcp', 'builtin'];

/** Tool source metadata */
export interface ToolSource {
    type: ToolSourceType;
    namespace: string; // e.g., 'mcp:github', 'skill:git-workflow'
}

/** JSON Schema for tool parameters */
export interface ToolParameters {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
}

/** Tool execution context for registered tools */
export interface RegisteredToolContext {
    toolCallId: string;
    messages: Array<{ role: string; content: unknown }>;
    abortSignal?: AbortSignal;
}

/** Registered tool definition */
export interface RegisteredTool {
    name: string;
    description: string;
    parameters: ToolParameters;
    source: ToolSource;
    execute?: (args: Record<string, unknown>, context?: RegisteredToolContext) => Promise<unknown>;
}

/** Conflict resolution strategy */
export type ConflictStrategy = 'first-wins' | 'error';

/** Tool registry configuration */
export interface ToolRegistryConfig {
    /** Sources to exclude from registration */
    excludeSources?: string[];
    /** Conflict resolution strategy (default: first-wins) */
    conflictStrategy?: ConflictStrategy;
    /** Logger instance */
    logger?: Logger;
}

/** Tool conflict error */
export class ToolConflictError extends Error {
    constructor(
        public readonly toolName: string,
        public readonly existingSource: string,
        public readonly newSource: string,
    ) {
        super(
            `Tool "${toolName}" conflict: ${existingSource} vs ${newSource}. ` +
            `Exclude one source in your config.`
        );
        this.name = 'ToolConflictError';
    }
}

/**
 * Tool Registry manages tool registration with deterministic conflict resolution.
 */
export class ToolRegistry {
    private tools = new Map<string, RegisteredTool>();
    private readonly config: Required<ToolRegistryConfig>;
    private readonly logger: Logger;

    constructor(config: ToolRegistryConfig = {}) {
        this.config = {
            excludeSources: config.excludeSources ?? [],
            conflictStrategy: config.conflictStrategy ?? 'first-wins',
            logger: config.logger ?? noopLogger,
        };
        this.logger = this.config.logger;
    }

    /**
     * Register a tool with conflict detection.
     * Tools are registered in priority order: user > skill > mcp > builtin
     */
    register(tool: RegisteredTool): boolean {
        const fullSource = `${tool.source.type}:${tool.source.namespace}`;

        // Check if source is excluded
        if (this.isSourceExcluded(fullSource, tool.source)) {
            this.logger.debug('Tool source excluded', {
                tool: tool.name,
                source: fullSource,
            });
            return false;
        }

        // Check for existing tool with same name
        const existing = this.tools.get(tool.name);

        if (existing) {
            const existingSource = `${existing.source.type}:${existing.source.namespace}`;

            // Same source = update
            if (existingSource === fullSource) {
                this.tools.set(tool.name, tool);
                return true;
            }

            // Different source = conflict
            if (this.config.conflictStrategy === 'error') {
                throw new ToolConflictError(tool.name, existingSource, fullSource);
            }

            // first-wins: compare priority
            const existingPriority = SOURCE_PRIORITY.indexOf(existing.source.type);
            const newPriority = SOURCE_PRIORITY.indexOf(tool.source.type);

            if (newPriority < existingPriority) {
                // New tool has higher priority, replace
                this.logger.warn('Tool replaced due to higher priority', {
                    tool: tool.name,
                    replaced: existingSource,
                    by: fullSource,
                });
                this.tools.set(tool.name, tool);
                return true;
            } else {
                // Existing tool has higher or equal priority, keep
                this.logger.warn('Tool registration skipped due to conflict', {
                    tool: tool.name,
                    kept: existingSource,
                    skipped: fullSource,
                });
                return false;
            }
        }

        // No conflict, register
        this.tools.set(tool.name, tool);
        return true;
    }

    /**
     * Register multiple tools from a source.
     * Tools are sorted by name for deterministic order.
     */
    registerAll(tools: RegisteredTool[]): { registered: number; skipped: number } {
        // Sort by name for deterministic registration order
        const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));

        let registered = 0;
        let skipped = 0;

        for (const tool of sorted) {
            if (this.register(tool)) {
                registered++;
            } else {
                skipped++;
            }
        }

        return { registered, skipped };
    }

    /**
     * Get a tool by name.
     */
    get(name: string): RegisteredTool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tools.
     */
    getAll(): RegisteredTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tools as OpenAI-compatible format.
     */
    toOpenAITools(): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: ToolParameters;
        };
    }> {
        return this.getAll().map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }

    /**
     * Clear all registered tools.
     */
    clear(): void {
        this.tools.clear();
    }

    /**
     * Check if a source should be excluded.
     */
    private isSourceExcluded(fullSource: string, source: ToolSource): boolean {
        return this.config.excludeSources.some(pattern => {
            // Match full source (e.g., 'mcp:github')
            if (pattern === fullSource) return true;
            // Match type only (e.g., 'mcp')
            if (pattern === source.type) return true;
            // Match namespace pattern (e.g., 'mcp:*')
            if (pattern.endsWith(':*') && pattern.slice(0, -2) === source.type) return true;
            return false;
        });
    }
}
