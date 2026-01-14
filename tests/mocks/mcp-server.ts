#!/usr/bin/env node
/**
 * Mock MCP Server for testing.
 * Implements minimal MCP protocol over stdio.
 */

import * as readline from 'readline';

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: number;
    method: string;
    params?: unknown;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id?: number;
    result?: unknown;
    error?: { code: number; message: string };
}

const MOCK_TOOLS = [
    {
        name: 'search',
        description: 'Search for content',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
        },
    },
    {
        name: 'fetch',
        description: 'Fetch URL content',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to fetch' },
            },
            required: ['url'],
        },
    },
];

function handleRequest(request: JsonRpcRequest): JsonRpcResponse | null {
    const { id, method, params } = request;

    switch (method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                    },
                    serverInfo: {
                        name: 'mock-mcp-server',
                        version: '1.0.0',
                    },
                },
            };

        case 'notifications/initialized':
            // Notification, no response
            return null;

        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    tools: MOCK_TOOLS,
                },
            };

        case 'tools/call': {
            const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };

            if (name === 'search') {
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            { type: 'text', text: `Search results for: ${args.query}` },
                        ],
                    },
                };
            }

            if (name === 'fetch') {
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            { type: 'text', text: `Content from: ${args.url}` },
                        ],
                    },
                };
            }

            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Unknown tool: ${name}` },
            };
        }

        default:
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` },
            };
    }
}

// Main
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

rl.on('line', (line) => {
    try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = handleRequest(request);

        if (response) {
            process.stdout.write(JSON.stringify(response) + '\n');
        }
    } catch (e) {
        process.stderr.write(`Error parsing request: ${e}\n`);
    }
});
