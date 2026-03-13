import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('entry points', () => {
    it('root entry remains a compatibility surface', async () => {
        const root = await import('../../src/index');

        expect(root.QiniuAI).toBeDefined();
        expect(root.createAgent).toBeDefined();
        expect(root.MCPHttpTransport).toBeDefined();
    });

    it('core entry exposes runtime APIs without Qiniu client exports', async () => {
        const core = await import('../../src/core/index');

        expect(core.createAgent).toBeDefined();
        expect(core.generateText).toBeDefined();
        expect('QiniuAI' in core).toBe(false);
        expect('auditLogger' in core).toBe(false);
    });

    it('qiniu entry exposes provider APIs without runtime orchestrators', async () => {
        const qiniu = await import('../../src/qiniu/index');

        expect(qiniu.QiniuAI).toBeDefined();
        expect(qiniu.CHAT_MODELS).toBeDefined();
        expect('createAgent' in qiniu).toBe(false);
    });

    it('node entry exports node-only MCP and token store helpers', async () => {
        const node = await import('../../src/node/index');

        expect(node.NodeMCPHost).toBeDefined();
        expect(node.MCPHttpTransport).toBeDefined();
        expect(node.FileTokenStore).toBeDefined();
        expect(node.QiniuMCPServer).toBeDefined();
        expect(node.auditLogger).toBeDefined();
    });

    it('browser entry excludes node-only MCP helpers', async () => {
        const browser = await import('../../src/browser/index');

        expect(browser.createAgent).toBeDefined();
        expect('MCPHttpTransport' in browser).toBe(false);
        expect('FileTokenStore' in browser).toBe(false);
        expect('NodeMCPHost' in browser).toBe(false);
    });

    it('package exports keep the root entry free of browser-only remapping', async () => {
        const packageJsonPath = join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
            exports?: Record<string, Record<string, unknown>>;
        };

        expect(packageJson.exports?.['.']).toBeDefined();
        expect('browser' in (packageJson.exports?.['.'] ?? {})).toBe(false);
    });
});
