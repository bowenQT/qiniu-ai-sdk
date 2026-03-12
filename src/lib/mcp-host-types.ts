/**
 * MCP Host Provider types — browser-safe (no Node.js dependencies).
 *
 * This interface is consumed by createAgent via DI injection.
 * The actual implementation (NodeMCPHost) lives in the node-only entry.
 *
 * @module
 */

// Re-export RegisteredTool from the canonical source
export type { RegisteredTool } from './tool-registry';
import type { RegisteredTool } from './tool-registry';

/** MCP resource descriptor */
export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    serverName: string;
}

/** MCP prompt descriptor */
export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    serverName: string;
}

/**
 * Per-server tool execution policy.
 * timeout/resetTimeoutOnProgress/maxTotalTimeout map directly to SDK RequestOptions.
 */
export interface MCPToolPolicy {
    /**
     * Request-level timeout (ms). Passed to SDK RequestOptions.timeout.
     * SDK default: 60000. SDK host default: 30000.
     */
    timeout?: number;
    /**
     * If true, reset timeout on progress notifications (for long-running tools).
     * Passed to SDK RequestOptions.resetTimeoutOnProgress.
     * Default: false.
     */
    resetTimeoutOnProgress?: boolean;
    /**
     * Absolute maximum time (ms), regardless of progress resets.
     * Passed to SDK RequestOptions.maxTotalTimeout.
     * Default: undefined (no hard cap).
     */
    maxTotalTimeout?: number;
    /** Mark MCP tools from this server as requiring approval. Default: false */
    requiresApproval?: boolean;
    /** Max output length in characters. Default: 1_048_576 */
    maxOutputLength?: number;
}

/**
 * Abstract host provider interface (browser-safe).
 * Implemented by NodeMCPHost in the node entry.
 */
export interface MCPHostProvider {
    /** Connect to all configured MCP servers */
    connect(): Promise<void>;
    /** Get currently available tools */
    getTools(): RegisteredTool[];
    /** Subscribe to tool changes (returns unsubscribe function) */
    onToolsChanged(cb: (tools: RegisteredTool[]) => void): () => void;
    /** List available resources */
    listResources?(): Promise<MCPResource[]>;
    /** Read a specific resource */
    readResource?(server: string, uri: string): Promise<string>;
    /** List available prompts */
    listPrompts?(): Promise<MCPPrompt[]>;
    /** Get a specific prompt */
    getPrompt?(server: string, name: string, args?: Record<string, string>): Promise<string>;
    /** Disconnect and clean up */
    dispose(): Promise<void>;
}
