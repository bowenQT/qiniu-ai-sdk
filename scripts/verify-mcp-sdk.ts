#!/usr/bin/env npx tsx
/**
 * L0 Gate: Verify MCP SDK installation and exports.
 * Run this in CI to ensure SDK compatibility before release.
 *
 * Usage: npx tsx scripts/verify-mcp-sdk.ts
 */

import process from 'node:process';

async function main() {
    console.log('🔍 Verifying @modelcontextprotocol/sdk installation...\n');

    const errors: string[] = [];
    const success: string[] = [];

    // 1. Verify Client import
    try {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        if (typeof Client === 'function') {
            success.push('✅ Client class imported successfully');
        } else {
            errors.push('❌ Client is not a constructor');
        }
    } catch (e) {
        errors.push(`❌ Failed to import Client: ${(e as Error).message}`);
    }

    // 2. Verify StreamableHTTPClientTransport import
    try {
        const { StreamableHTTPClientTransport } = await import(
            '@modelcontextprotocol/sdk/client/streamableHttp.js'
        );
        if (typeof StreamableHTTPClientTransport === 'function') {
            success.push('✅ StreamableHTTPClientTransport imported successfully');
        } else {
            errors.push('❌ StreamableHTTPClientTransport is not a constructor');
        }
    } catch (e) {
        errors.push(`❌ Failed to import StreamableHTTPClientTransport: ${(e as Error).message}`);
    }

    // 3. Verify SSEClientTransport (fallback)
    try {
        const { SSEClientTransport } = await import(
            '@modelcontextprotocol/sdk/client/sse.js'
        );
        if (typeof SSEClientTransport === 'function') {
            success.push('✅ SSEClientTransport imported successfully (fallback)');
        } else {
            errors.push('❌ SSEClientTransport is not a constructor');
        }
    } catch (e) {
        // SSE is optional fallback
        success.push('⚠️ SSEClientTransport not available (optional)');
    }

    // 4. Verify StdioClientTransport (existing)
    try {
        const { StdioClientTransport } = await import(
            '@modelcontextprotocol/sdk/client/stdio.js'
        );
        if (typeof StdioClientTransport === 'function') {
            success.push('✅ StdioClientTransport imported successfully (existing)');
        } else {
            errors.push('❌ StdioClientTransport is not a constructor');
        }
    } catch (e) {
        errors.push(`❌ Failed to import StdioClientTransport: ${(e as Error).message}`);
    }

    // 5. Check Node.js version
    const nodeVersion = process.versions.node;
    const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
    if (majorVersion >= 18) {
        success.push(`✅ Node.js version ${nodeVersion} >= 18 (native fetch)`);
    } else {
        errors.push(`❌ Node.js version ${nodeVersion} < 18 (fetch polyfill needed)`);
    }

    // Print results
    console.log('Results:\n');
    for (const msg of success) {
        console.log(msg);
    }
    for (const msg of errors) {
        console.log(msg);
    }

    console.log('\n---');

    if (errors.length > 0) {
        console.log(`\n❌ GATE FAILED: ${errors.length} error(s)`);
        console.log('\nFallback: Consider implementing native fetch-based HTTP transport');
        process.exit(1);
    }

    console.log('\n✅ GATE PASSED: All MCP SDK imports verified');
    process.exit(0);
}

main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
});
