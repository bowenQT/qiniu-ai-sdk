import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const NODE_ONLY_PATH_PREFIXES = [
    'src/node/',
    'src/modules/mcp/',
    'src/modules/sandbox/',
];
const NODE_ONLY_IMPLEMENTATIONS = new Set([
    'src/ai/graph/redis-checkpointer.ts',
    'src/ai/graph/postgres-checkpointer.ts',
    'src/modules/skills/loader.ts',
]);

interface ModuleGraph {
    files: Set<string>;
    nodeSpecifiers: Array<{ importer: string; specifier: string }>;
}

function normalizeRelativePath(path: string): string {
    return path.replace(/\\/g, '/');
}

function repoRelativePath(path: string): string {
    return normalizeRelativePath(relative(process.cwd(), path));
}

function isNodeOnlyImplementation(path: string): boolean {
    return NODE_ONLY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
        || NODE_ONLY_IMPLEMENTATIONS.has(path);
}

function extractModuleSpecifiers(source: string): string[] {
    const specifiers = new Set<string>();
    const patterns = [
        /\bfrom\s*['"]([^'"]+)['"]/g,
        /\bimport\s*['"]([^'"]+)['"]/g,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            specifiers.add(match[1]);
        }
    }

    return Array.from(specifiers);
}

async function resolveRelativeModule(fromFile: string, specifier: string): Promise<string> {
    const base = resolve(dirname(fromFile), specifier);
    const candidates = [
        base,
        ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
    ];

    for (const candidate of candidates) {
        try {
            await readFile(candidate, 'utf8');
            return candidate;
        } catch {
            // Try next candidate.
        }
    }

    throw new Error(`Unable to resolve relative module "${specifier}" from ${repoRelativePath(fromFile)}`);
}

async function collectRelativeModuleGraph(entryRelativePath: string): Promise<ModuleGraph> {
    const visited = new Set<string>();
    const nodeSpecifiers: Array<{ importer: string; specifier: string }> = [];
    const queue = [resolve(process.cwd(), entryRelativePath)];

    while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const source = await readFile(current, 'utf8');
        for (const specifier of extractModuleSpecifiers(source)) {
            if (specifier.startsWith('node:')) {
                nodeSpecifiers.push({ importer: repoRelativePath(current), specifier });
                continue;
            }

            if (!specifier.startsWith('.')) {
                continue;
            }

            const resolved = await resolveRelativeModule(current, specifier);
            if (!visited.has(resolved)) {
                queue.push(resolved);
            }
        }
    }

    return {
        files: new Set(Array.from(visited, repoRelativePath)),
        nodeSpecifiers,
    };
}

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
        expect('ResponseAPI' in root).toBe(false);
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
        expect(qiniu.ResponseAPI).toBeDefined();
        expect('createAgent' in qiniu).toBe(false);
    });

    it('node entry exports node-only MCP and token store helpers', async () => {
        const node = await import('../../src/node/index');

        expect(node.createNodeQiniuAI).toBeDefined();
        expect(node.createKodoAuditSink).toBeDefined();
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

    it('cross-platform entry graphs do not reach Node-only modules or builtins', async () => {
        const crossPlatformEntries = [
            'src/index.ts',
            'src/core/index.ts',
            'src/browser/index.ts',
            'src/qiniu/index.ts',
        ];

        for (const entryRelativePath of crossPlatformEntries) {
            const graph = await collectRelativeModuleGraph(entryRelativePath);

            expect(graph.nodeSpecifiers).toEqual([]);

            for (const file of graph.files) {
                expect(isNodeOnlyImplementation(file)).toBe(false);
            }
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

    it('node entry graph stays inside node integrations and never re-imports the root compatibility client', async () => {
        const rootClientImportPattern = /from ['"](?:\.\.\/)+client['"]/;
        const graph = await collectRelativeModuleGraph('src/node/index.ts');

        expect(graph.files.has('src/node/checkpointers.ts')).toBe(true);
        expect(graph.files.has('src/node/internal/kodo-client.ts')).toBe(true);

        for (const relativePath of graph.files) {
            const source = await readFile(join(process.cwd(), relativePath), 'utf8');
            expect(source).not.toMatch(rootClientImportPattern);
        }
    });
});
