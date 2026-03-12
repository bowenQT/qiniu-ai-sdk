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
