#!/usr/bin/env node
/**
 * Qiniu MCP Server CLI
 * 
 * Usage:
 *   npx qiniu-mcp-server
 * 
 * Environment Variables:
 *   QINIU_API_KEY       - Required for AI services
 *   QINIU_ACCESS_KEY    - Optional for Kodo storage
 *   QINIU_SECRET_KEY    - Optional for Kodo storage
 *   QINIU_ALLOWED_BUCKETS - Optional comma-separated bucket whitelist
 */

import { startFromEnv } from '../dist/modules/mcp/server.mjs';

startFromEnv().catch((error) => {
    console.error('Failed to start Qiniu MCP Server:', error.message);
    process.exit(1);
});
