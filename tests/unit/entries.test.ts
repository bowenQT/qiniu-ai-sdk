import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('entry points', () => {
    it('root entry exposes only the cross-platform compatibility surface', async () => {
        const root = await import('../../src/index');

        expect(root.QiniuAI).toBeDefined();
        expect(root.createAgent).toBeDefined();
        expect(root.MemoryCheckpointer).toBeDefined();
        expect('auditLogger' in root).toBe(false);
        expect('QiniuSandbox' in root).toBe(false);
        expect('SkillLoader' in root).toBe(false);
        expect('SkillRegistry' in root).toBe(false);
        expect('MCPHttpTransport' in root).toBe(false);
        expect('FileTokenStore' in root).toBe(false);
        expect('QiniuMCPServer' in root).toBe(false);
        expect('RedisCheckpointer' in root).toBe(false);
        expect('PostgresCheckpointer' in root).toBe(false);
        expect('KodoCheckpointer' in root).toBe(false);
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

        expect(node.createNodeQiniuAI).toBeDefined();
        expect(node.NodeMCPHost).toBeDefined();
        expect(node.MCPHttpTransport).toBeDefined();
        expect(node.FileTokenStore).toBeDefined();
        expect(node.QiniuMCPServer).toBeDefined();
        expect(node.auditLogger).toBeDefined();
        expect(node.SkillRegistry).toBeDefined();
    });

    it('browser entry excludes node-only MCP helpers', async () => {
        const browser = await import('../../src/browser/index');

        expect(browser.createAgent).toBeDefined();
        expect('MCPHttpTransport' in browser).toBe(false);
        expect('FileTokenStore' in browser).toBe(false);
        expect('NodeMCPHost' in browser).toBe(false);
        expect('createNodeQiniuAI' in browser).toBe(false);
    });

    it('package exports keep the root entry free of browser-only remapping', async () => {
        const packageJsonPath = join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
            exports?: Record<string, Record<string, unknown>>;
        };

        expect(packageJson.exports?.['.']).toBeDefined();
        expect('browser' in (packageJson.exports?.['.'] ?? {})).toBe(false);
    });

    it('browser-safe entry sources do not statically reference sandbox or Node builtins', async () => {
        const browserSafeFiles = [
            'src/qiniu/client.ts',
            'src/modules/account/index.ts',
            'src/modules/video/index.ts',
            'src/modules/tts/index.ts',
        ];

        for (const relativePath of browserSafeFiles) {
            const source = await readFile(join(process.cwd(), relativePath), 'utf8');
            expect(source).not.toMatch(/modules\/sandbox/);
            expect(source).not.toMatch(/node:/);
            expect(source).not.toMatch(/\bBuffer\b/);
            expect(source).not.toMatch(/require\(['"]crypto['"]\)/);
            expect(source).not.toMatch(/import\(['"]ws['"]\)/);
            expect(source).not.toMatch(/from ['"]ws['"]/);
        }

        const browserEntryPath = join(process.cwd(), 'src/browser/index.ts');
        const browserEntrySource = await readFile(browserEntryPath, 'utf8');
        expect(browserEntrySource).toContain("../qiniu/client");
        expect(browserEntrySource).not.toContain("../client';");

        const qiniuEntryPath = join(process.cwd(), 'src/qiniu/index.ts');
        const qiniuEntrySource = await readFile(qiniuEntryPath, 'utf8');
        expect(qiniuEntrySource).toContain("./client");
        expect(qiniuEntrySource).not.toContain("../client';");
    });
});
