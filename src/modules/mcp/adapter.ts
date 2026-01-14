/**
 * MCP Tool Adapter - converts MCP tools to SDK RegisteredTool format.
 */

import type { MCPToolDefinition } from './types';
import type { RegisteredTool, ToolSource } from '../../lib/tool-registry';
import type { MCPClient } from './client';

/**
 * Convert MCP tools to SDK RegisteredTool format.
 * Sorted by name for deterministic registration order.
 */
export function adaptMCPToolsToRegistry(
    tools: MCPToolDefinition[],
    serverName: string,
    client: MCPClient
): RegisteredTool[] {
    const source: ToolSource = {
        type: 'mcp',
        namespace: serverName,
    };

    return tools
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            source,
            execute: async (args: Record<string, unknown>) => {
                const result = await client.executeTool(serverName, tool.name, args);

                // Extract text content
                const textContents = result.content
                    .filter(c => c.type === 'text' && c.text)
                    .map(c => c.text)
                    .join('\n');

                if (result.isError) {
                    throw new Error(textContents || 'Tool execution failed');
                }

                return textContents || result;
            },
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all tools from a specific MCP server.
 * Each server maintains its own tool list.
 */
export function getServerTools(
    client: MCPClient,
    serverName: string
): RegisteredTool[] {
    const tools = client.getServerTools(serverName);
    return adaptMCPToolsToRegistry(tools, serverName, client);
}

/**
 * Get all tools from all connected MCP servers.
 * Tools are collected per-server and concatenated; actual deduplication
 * happens in ToolRegistry via priority/conflict resolution.
 */
export function getAllMCPToolsAsRegistered(
    client: MCPClient
): RegisteredTool[] {
    const allTools: RegisteredTool[] = [];
    const serverNames = client.getConnectedServerNames();

    // Sort server names for deterministic order
    const sorted = [...serverNames].sort();

    for (const serverName of sorted) {
        const serverTools = getServerTools(client, serverName);
        allTools.push(...serverTools);
    }

    return allTools;
}
