import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { getModuleMaturity } from '../lib/capability-registry';
import type { StarterTemplate } from './init';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const ROOT_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]@bowenqt\/qiniu-ai-sdk['"]/g;
const NODE_IMPORT_RE = /from\s+['"]@bowenqt\/qiniu-ai-sdk\/node['"]/;
const CORE_IMPORT_RE = /from\s+['"]@bowenqt\/qiniu-ai-sdk\/core['"]/;
const EXPERIMENTAL_PATTERNS = new Map<string, RegExp>([
    ['ResponseAPI', /\bResponseAPI\b/],
    ['crew', /\bcreateCrew\b|\bcreateSequentialCrew\b|\bcreateParallelCrew\b|\bcreateHierarchicalCrew\b/],
    ['A2A', /\bAgentExpert\b|\bcreateA2ARequest\b|\bcreateA2AResponse\b/],
    ['QiniuMCPServer', /\bQiniuMCPServer\b/],
]);

export type WorktreeLane =
    | 'foundation'
    | 'cloud-surface'
    | 'runtime'
    | 'node-integrations'
    | 'dx-validation'
    | 'integration';

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
    level: DoctorStatus;
    message: string;
}

export interface DoctorCommandOptions {
    template: StarterTemplate;
    projectDir: string;
    env?: NodeJS.ProcessEnv;
    nodeVersion?: string;
    lane?: WorktreeLane;
}

export interface DoctorCommandResult {
    status: DoctorStatus;
    exitCode: 0 | 1 | 2;
    checks: DoctorCheck[];
}

interface ProjectPackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

function addCheck(checks: DoctorCheck[], level: DoctorStatus, message: string): void {
    checks.push({ level, message });
}

function resolveProjectFiles(projectDir: string): string[] {
    const output: string[] = [];

    function walk(currentDir: string): void {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) {
                    walk(path.join(currentDir, entry.name));
                }
                continue;
            }

            if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
            output.push(path.join(currentDir, entry.name));
        }
    }

    walk(projectDir);
    return output.sort();
}

function resolvePackage(projectDir: string, dependency: string): boolean {
    const projectRequire = createRequire(path.join(projectDir, 'package.json'));
    try {
        projectRequire.resolve(`${dependency}/package.json`);
        return true;
    } catch {
        return false;
    }
}

function readProjectPackageJson(projectDir: string): ProjectPackageJson {
    const packageJsonPath = path.join(projectDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as ProjectPackageJson;
    } catch {
        return {};
    }
}

function getDeclaredDependencies(projectPackage: ProjectPackageJson): Set<string> {
    return new Set([
        ...Object.keys(projectPackage.dependencies ?? {}),
        ...Object.keys(projectPackage.devDependencies ?? {}),
        ...Object.keys(projectPackage.optionalDependencies ?? {}),
        ...Object.keys(projectPackage.peerDependencies ?? {}),
    ]);
}

function readProjectDotEnv(projectDir: string): Record<string, string> {
    const envPath = path.join(projectDir, '.env');
    if (!fs.existsSync(envPath)) {
        return {};
    }

    const values: Record<string, string> = {};
    const source = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
        const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;

        const [, key, rawValue] = match;
        let value = rawValue.trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        values[key] = value;
    }

    return values;
}

function resolveDoctorEnv(projectDir: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
        ...readProjectDotEnv(projectDir),
        ...env,
    };
}

function getNodeMajor(version: string): number {
    const match = version.match(/v?(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
}

function inferLaneFromBranch(branch: string): WorktreeLane | undefined {
    if (branch === 'codex/vnext-integration') return 'integration';
    if (!branch.startsWith('codex/vnext/')) return undefined;

    const lane = branch.slice('codex/vnext/'.length) as WorktreeLane;
    switch (lane) {
        case 'foundation':
        case 'cloud-surface':
        case 'runtime':
        case 'node-integrations':
        case 'dx-validation':
            return lane;
        default:
            return undefined;
    }
}

function inferLaneFromProjectPath(projectDir: string): WorktreeLane | undefined {
    const segments = projectDir.split(path.sep);
    const index = segments.lastIndexOf('.worktrees');
    if (index === -1 || index >= segments.length - 1) return undefined;

    const candidate = segments[index + 1];
    if (candidate === 'integration') return 'integration';
    return inferLaneFromBranch(`codex/vnext/${candidate}`);
}

function inferLaneFromGit(projectDir: string): WorktreeLane | undefined {
    const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (branchResult.status === 0) {
        const lane = inferLaneFromBranch(branchResult.stdout.trim());
        if (lane) return lane;
    }

    return inferLaneFromProjectPath(projectDir);
}

function extractRootImports(source: string): string[] {
    const imported: string[] = [];
    for (const match of source.matchAll(ROOT_IMPORT_RE)) {
        const specifiers = match[1]
            .split(',')
            .map((item) => item.replace(/\btype\b/g, '').trim())
            .filter(Boolean);
        imported.push(...specifiers);
    }
    return imported;
}

function summarizeStatus(checks: DoctorCheck[]): DoctorStatus {
    if (checks.some((check) => check.level === 'fail')) return 'fail';
    if (checks.some((check) => check.level === 'warn')) return 'warn';
    return 'ok';
}

export function doctorProject(options: DoctorCommandOptions): DoctorCommandResult {
    const checks: DoctorCheck[] = [];
    const projectDir = path.resolve(options.projectDir);
    const env = resolveDoctorEnv(projectDir, options.env ?? process.env);
    const nodeVersion = options.nodeVersion ?? process.version;
    const projectPackage = readProjectPackageJson(projectDir);
    const declaredDependencies = getDeclaredDependencies(projectPackage);
    const lane = options.lane ?? inferLaneFromGit(projectDir);

    const nodeMajor = getNodeMajor(nodeVersion);
    if (nodeMajor < 18) {
        addCheck(checks, 'fail', `Node.js ${nodeVersion} is unsupported. Use Node.js >= 18.`);
    } else {
        addCheck(checks, 'ok', `Node.js ${nodeVersion} satisfies the SDK runtime requirement.`);
    }

    if (!env.QINIU_API_KEY) {
        addCheck(checks, 'fail', 'Missing QINIU_API_KEY in the current environment.');
    } else {
        addCheck(checks, 'ok', 'QINIU_API_KEY is present.');
    }

    if (lane) {
        addCheck(checks, 'ok', `Detected worktree lane: ${lane}.`);
    }

    const requiredPeerDeps = new Set<string>();
    if (options.template === 'agent' || options.template === 'node-agent') {
        requiredPeerDeps.add('zod');
    }
    if (options.template === 'node-agent') {
        requiredPeerDeps.add('ws');
    }

    const files = resolveProjectFiles(projectDir);
    const sources = files.map((filePath) => ({
        filePath,
        relativePath: path.relative(projectDir, filePath).replace(/\\/g, '/'),
        source: fs.readFileSync(filePath, 'utf8'),
    }));

    const usesRedis = sources.some((entry) => entry.source.includes('RedisCheckpointer'));
    const usesPostgres = sources.some((entry) => entry.source.includes('PostgresCheckpointer'));
    if (usesRedis) requiredPeerDeps.add('ioredis');
    if (usesPostgres) requiredPeerDeps.add('pg');

    for (const dependency of Array.from(requiredPeerDeps).sort()) {
        if (resolvePackage(projectDir, dependency)) {
            addCheck(checks, 'ok', `Peer dependency "${dependency}" is installed.`);
        } else if (declaredDependencies.has(dependency)) {
            addCheck(
                checks,
                'warn',
                `Peer dependency "${dependency}" is declared in package.json but not installed yet. Run npm install.`,
            );
        } else {
            const level: DoctorStatus = dependency === 'ioredis' || dependency === 'pg' ? 'warn' : 'fail';
            addCheck(checks, level, `Missing peer dependency "${dependency}" in package.json and node_modules.`);
        }
    }

    const rootImportFiles: string[] = [];
    const nodeImportFiles: string[] = [];
    const coreImportFiles: string[] = [];
    const experimentalUsage = new Map<string, string[]>();

    for (const entry of sources) {
        const rootImports = extractRootImports(entry.source);
        if (rootImports.length > 0) {
            rootImportFiles.push(`${entry.relativePath}: ${rootImports.join(', ')}`);
        }
        if (NODE_IMPORT_RE.test(entry.source)) {
            nodeImportFiles.push(entry.relativePath);
        }
        if (CORE_IMPORT_RE.test(entry.source)) {
            coreImportFiles.push(entry.relativePath);
        }

        for (const [moduleName, pattern] of EXPERIMENTAL_PATTERNS) {
            if (!pattern.test(entry.source)) continue;
            const matches = experimentalUsage.get(moduleName) ?? [];
            matches.push(entry.relativePath);
            experimentalUsage.set(moduleName, matches);
        }
    }

    if (rootImportFiles.length > 0) {
        addCheck(
            checks,
            'warn',
            `Root entry imports found. Prefer subpath imports instead:\n- ${rootImportFiles.join('\n- ')}`,
        );
    } else {
        addCheck(checks, 'ok', 'No root-entry imports were detected in project source files.');
    }

    for (const [moduleName, filesWithUsage] of experimentalUsage) {
        const maturity = getModuleMaturity(moduleName);
        addCheck(
            checks,
            maturity?.maturity === 'experimental' ? 'warn' : 'ok',
            `${moduleName} usage detected (${maturity?.maturity ?? 'unknown'}):\n- ${filesWithUsage.join('\n- ')}${
                maturity?.docsUrl ? `\nDocs: ${maturity.docsUrl}` : ''
            }`,
        );
    }

    if (options.template === 'chat' && coreImportFiles.length > 0) {
        addCheck(
            checks,
            'warn',
            `Template "chat" currently uses core runtime imports. Consider switching to the "agent" starter:\n- ${coreImportFiles.join('\n- ')}`,
        );
    }

    if (options.template !== 'node-agent' && nodeImportFiles.length > 0) {
        addCheck(
            checks,
            'warn',
            `Node-only imports detected outside the "node-agent" starter path:\n- ${nodeImportFiles.join('\n- ')}`,
        );
    } else if (options.template === 'node-agent' && nodeImportFiles.length === 0) {
        addCheck(checks, 'warn', 'No /node imports detected. This project may not need the "node-agent" starter.');
    }

    if (lane && lane !== 'node-integrations' && nodeImportFiles.length > 0) {
        addCheck(
            checks,
            'warn',
            `Lane "${lane}" should not own Node-only imports:\n- ${nodeImportFiles.join('\n- ')}`,
        );
    }

    if (lane === 'node-integrations' && nodeImportFiles.length === 0) {
        addCheck(checks, 'warn', 'node-integrations lane should contain /node imports, but none were detected.');
    }

    if (lane === 'cloud-surface' && coreImportFiles.length > 0) {
        addCheck(
            checks,
            'warn',
            `cloud-surface lane should stay provider-focused. /core imports detected:\n- ${coreImportFiles.join('\n- ')}`,
        );
    }

    if (lane === 'runtime' && coreImportFiles.length === 0) {
        addCheck(checks, 'warn', 'runtime lane usually owns /core imports, but none were detected.');
    }

    const status = summarizeStatus(checks);
    return {
        status,
        exitCode: status === 'ok' ? 0 : status === 'warn' ? 2 : 1,
        checks,
    };
}
