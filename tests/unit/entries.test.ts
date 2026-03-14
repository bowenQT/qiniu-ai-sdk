import { builtinModules } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SHARED_SKILL_FILES = new Set([
    'src/modules/skills/index.ts',
    'src/modules/skills/manifest.ts',
    'src/modules/skills/reference-mode.ts',
    'src/modules/skills/types.ts',
]);
const LEGACY_NODE_ONLY_FILES = [
    'src/ai/graph/redis-checkpointer.ts',
    'src/ai/graph/postgres-checkpointer.ts',
    'src/ai/guardrails/audit-logger.ts',
];

const NODE_BUILTIN_SPECIFIERS = new Set(
    builtinModules.flatMap((specifier) => {
        const normalized = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
        return [normalized, `node:${normalized}`];
    }),
);

interface ModuleGraph {
    files: Set<string>;
    builtinSpecifiers: Array<{ importer: string; specifier: string }>;
}

function normalizeRelativePath(path: string): string {
    return path.replace(/\\/g, '/');
}

function repoRelativePath(path: string): string {
    return normalizeRelativePath(relative(process.cwd(), path));
}

async function collectFilesRecursive(dirRelativePath: string): Promise<string[]> {
    const base = resolve(process.cwd(), dirRelativePath);
    const output: string[] = [];

    async function walk(current: string): Promise<void> {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const absolute = join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(absolute);
                continue;
            }
            output.push(repoRelativePath(absolute));
        }
    }

    try {
        await walk(base);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    return output.sort();
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
    const builtinSpecifiers: Array<{ importer: string; specifier: string }> = [];
    const queue = [resolve(process.cwd(), entryRelativePath)];

    while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const source = await readFile(current, 'utf8');
        for (const specifier of extractModuleSpecifiers(source)) {
            if (NODE_BUILTIN_SPECIFIERS.has(specifier)) {
                builtinSpecifiers.push({ importer: repoRelativePath(current), specifier });
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
        builtinSpecifiers,
    };
}

describe('entry points', () => {
    it('root entry exposes only the cross-platform compatibility surface', async () => {
        const root = await import('../../src/index');

        expect(root.QiniuAI).toBeDefined();
        expect(root.createAgent).toBeDefined();
        expect(root.listModels).toBeDefined();
        expect(root.getModuleMaturity).toBeDefined();
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
        expect(qiniu.listModels).toBeDefined();
        expect(qiniu.getModelCapabilities).toBeDefined();
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
        expect(browser.listModels).toBeDefined();
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

            expect(graph.builtinSpecifiers).toEqual([]);

            for (const file of graph.files) {
                expect(file.startsWith('src/node/')).toBe(false);
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
        expect(graph.builtinSpecifiers.length).toBeGreaterThan(0);

        for (const relativePath of graph.files) {
            const source = await readFile(join(process.cwd(), relativePath), 'utf8');
            expect(source).not.toMatch(rootClientImportPattern);
        }
    });

    it('node-only implementations live under src/node', async () => {
        const modulesMcpFiles = await collectFilesRecursive('src/modules/mcp');
        const modulesSandboxFiles = await collectFilesRecursive('src/modules/sandbox');
        const sharedSkillFiles = await collectFilesRecursive('src/modules/skills');

        expect(modulesMcpFiles).toEqual([]);
        expect(modulesSandboxFiles).toEqual([]);
        expect(new Set(sharedSkillFiles)).toEqual(SHARED_SKILL_FILES);

        for (const relativePath of LEGACY_NODE_ONLY_FILES) {
            await expect(readFile(join(process.cwd(), relativePath), 'utf8')).rejects.toThrow();
        }
    });
});
