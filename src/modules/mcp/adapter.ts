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
 * Get all tools from MCP client as RegisteredTools.
 */
export function getAllMCPToolsAsRegistered(
    client: MCPClient,
    serverNames: string[]
): RegisteredTool[] {
    const allTools: RegisteredTool[] = [];

    // Sort server names for deterministic order
    const sorted = [...serverNames].sort();

    for (const serverName of sorted) {
        const tools = client.getAllTools().filter(t =>
            // Filter tools by server (if we had server info)
            true
        );

        const adapted = adaptMCPToolsToRegistry(tools, serverName, client);
        allTools.push(...adapted);
    }

    return allTools;
}
