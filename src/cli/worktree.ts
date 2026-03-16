import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_WORKTREE_ROOT = '.worktrees';
const FALLBACK_WORKTREE_ROOT = 'worktrees';
const DEFAULT_INTEGRATION_BRANCH = 'codex/vnext-integration';
const LANE_BRANCH_PREFIX = 'codex/vnext/';

export interface WorktreeCLIOptions {
    cwd?: string;
}

export interface WorktreeSummary {
    path: string;
    branch?: string;
    head?: string;
    detached: boolean;
    lane?: string;
}

export interface WorktreeInitResult {
    repoRoot: string;
    worktreeRoot: string;
    integrationBranch: string;
    integrationPath: string;
    created: boolean;
}

export interface WorktreeSpawnResult {
    repoRoot: string;
    worktreeRoot: string;
    lane: string;
    branch: string;
    path: string;
    created: boolean;
}

export interface WorktreeIntegrateResult {
    integrationPath: string;
    integrationBranch: string;
    lane: string;
    laneBranch: string;
    summary: string;
}

function runGit(repoRoot: string, args: string[], opts: { cwd?: string } = {}): string {
    const result = spawnSync('git', args, {
        cwd: opts.cwd ?? repoRoot,
        encoding: 'utf8',
    });

    if (result.status !== 0) {
        const stderr = (result.stderr || result.stdout || '').trim();
        throw new Error(stderr || `git ${args.join(' ')} failed`);
    }

    return result.stdout.trim();
}

function runGitQuiet(repoRoot: string, args: string[], opts: { cwd?: string } = {}): boolean {
    const result = spawnSync('git', args, {
        cwd: opts.cwd ?? repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
    });
    return result.status === 0;
}

export function resolveRepoRoot(cwd: string = process.cwd()): string {
    const commonDir = runGit(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
    const candidate = path.dirname(commonDir);

    if (fs.existsSync(path.join(candidate, '.git'))) {
        return candidate;
    }

    return runGit(cwd, ['rev-parse', '--show-toplevel'], { cwd });
}

export function resolveWorktreeRoot(repoRoot: string, configuredRoot?: string): string {
    if (configuredRoot) {
        return path.resolve(repoRoot, configuredRoot);
    }

    const preferred = path.join(repoRoot, DEFAULT_WORKTREE_ROOT);
    if (fs.existsSync(preferred)) return preferred;

    const fallback = path.join(repoRoot, FALLBACK_WORKTREE_ROOT);
    if (fs.existsSync(fallback)) return fallback;

    return preferred;
}

export function sanitizeLaneName(value: string): string {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!normalized) {
        throw new Error(`Invalid lane "${value}"`);
    }

    if (normalized === 'integration') {
        throw new Error('Lane name "integration" is reserved');
    }

    return normalized;
}

export function branchNameForLane(lane: string): string {
    return `${LANE_BRANCH_PREFIX}${sanitizeLaneName(lane)}`;
}

function inferLaneFromBranch(branch?: string): string | undefined {
    if (!branch) return undefined;
    if (branch === DEFAULT_INTEGRATION_BRANCH) return 'integration';
    if (branch.startsWith(LANE_BRANCH_PREFIX)) return branch.slice(LANE_BRANCH_PREFIX.length);
    return undefined;
}

function ensureIgnoredWorktreeRoot(repoRoot: string, worktreeRoot: string): void {
    const relativeRoot = path.relative(repoRoot, worktreeRoot).replace(/\\/g, '/');
    if (relativeRoot.startsWith('..')) return;

    const ignoreTarget = relativeRoot.endsWith('/') ? relativeRoot : `${relativeRoot}/`;
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

    if (current.split(/\r?\n/).some((line) => line.trim() === ignoreTarget)) {
        return;
    }

    const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, `${current}${prefix}${ignoreTarget}\n`, 'utf8');
}

function hasLocalBranch(repoRoot: string, branch: string): boolean {
    return runGitQuiet(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
}

function currentBranch(repoRoot: string): string {
    return runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

function currentBranchAtPath(repoRoot: string, cwd: string): string {
    return runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
}

function currentHeadAtPath(repoRoot: string, cwd: string): string {
    return runGit(repoRoot, ['rev-parse', 'HEAD'], { cwd });
}

function branchHead(repoRoot: string, branch: string): string {
    return runGit(repoRoot, ['rev-parse', branch]);
}

function resolveGitCommonDir(cwd: string): string {
    const commonDir = runGit(cwd, ['rev-parse', '--git-common-dir'], { cwd });
    return fs.realpathSync.native(path.resolve(cwd, commonDir));
}

function ensureWorktreePathMatchesBranch(
    repoRoot: string,
    worktreePath: string,
    expectedBranch: string,
    label: string,
): void {
    let actualCommonDir: string;
    try {
        actualCommonDir = resolveGitCommonDir(worktreePath);
    } catch {
        throw new Error(`${label} at ${worktreePath} exists but is not a git worktree for this repository.`);
    }

    const normalizedRepoCommonDir = resolveGitCommonDir(repoRoot);
    if (actualCommonDir !== normalizedRepoCommonDir) {
        throw new Error(`${label} at ${worktreePath} belongs to a different repository.`);
    }

    const actualBranch = currentBranchAtPath(repoRoot, worktreePath);
    if (actualBranch !== expectedBranch) {
        throw new Error(
            `${label} at ${worktreePath} is on branch "${actualBranch}" but expected "${expectedBranch}".`,
        );
    }
}

export function initWorktreeWorkspace(options: {
    projectDir?: string;
    worktreeRoot?: string;
    baseBranch?: string;
    integrationBranch?: string;
} = {}): WorktreeInitResult {
    const repoRoot = resolveRepoRoot(options.projectDir ?? process.cwd());
    const worktreeRoot = resolveWorktreeRoot(repoRoot, options.worktreeRoot);
    const integrationBranch = options.integrationBranch ?? DEFAULT_INTEGRATION_BRANCH;
    const integrationPath = path.join(worktreeRoot, 'integration');
    const baseBranch = options.baseBranch ?? currentBranch(repoRoot);

    fs.mkdirSync(worktreeRoot, { recursive: true });
    ensureIgnoredWorktreeRoot(repoRoot, worktreeRoot);

    if (fs.existsSync(integrationPath)) {
        ensureWorktreePathMatchesBranch(repoRoot, integrationPath, integrationBranch, 'Integration worktree');
        return {
            repoRoot,
            worktreeRoot,
            integrationBranch,
            integrationPath,
            created: false,
        };
    }

    if (hasLocalBranch(repoRoot, integrationBranch)) {
        runGit(repoRoot, ['worktree', 'add', integrationPath, integrationBranch]);
    } else {
        runGit(repoRoot, ['worktree', 'add', '-b', integrationBranch, integrationPath, baseBranch]);
    }

    return {
        repoRoot,
        worktreeRoot,
        integrationBranch,
        integrationPath,
        created: true,
    };
}

export function spawnLaneWorktree(options: {
    lane: string;
    projectDir?: string;
    worktreeRoot?: string;
    integrationBranch?: string;
}): WorktreeSpawnResult {
    const repoRoot = resolveRepoRoot(options.projectDir ?? process.cwd());
    const worktreeRoot = resolveWorktreeRoot(repoRoot, options.worktreeRoot);
    const lane = sanitizeLaneName(options.lane);
    const branch = branchNameForLane(lane);
    const integrationBranch = options.integrationBranch ?? DEFAULT_INTEGRATION_BRANCH;
    const lanePath = path.join(worktreeRoot, lane);

    if (!hasLocalBranch(repoRoot, integrationBranch)) {
        throw new Error(
            `Integration branch "${integrationBranch}" does not exist. Run "qiniu-ai worktree init" first.`,
        );
    }

    fs.mkdirSync(worktreeRoot, { recursive: true });

    if (fs.existsSync(lanePath)) {
        ensureWorktreePathMatchesBranch(repoRoot, lanePath, branch, `Lane worktree "${lane}"`);
        return {
            repoRoot,
            worktreeRoot,
            lane,
            branch,
            path: lanePath,
            created: false,
        };
    }

    if (hasLocalBranch(repoRoot, branch)) {
        runGit(repoRoot, ['worktree', 'add', lanePath, branch]);
    } else {
        runGit(repoRoot, ['worktree', 'add', '-b', branch, lanePath, integrationBranch]);
    }

    return {
        repoRoot,
        worktreeRoot,
        lane,
        branch,
        path: lanePath,
        created: true,
    };
}

export function listWorktrees(projectDir?: string): WorktreeSummary[] {
    const repoRoot = resolveRepoRoot(projectDir ?? process.cwd());
    const output = runGit(repoRoot, ['worktree', 'list', '--porcelain']);
    const blocks = output.split('\n\n').map((block) => block.trim()).filter(Boolean);

    return blocks.map((block) => {
        const summary: WorktreeSummary = {
            path: '',
            detached: false,
        };

        for (const line of block.split('\n')) {
            if (line.startsWith('worktree ')) summary.path = line.slice('worktree '.length);
            else if (line.startsWith('HEAD ')) summary.head = line.slice('HEAD '.length);
            else if (line.startsWith('branch ')) summary.branch = line.slice('branch '.length).replace('refs/heads/', '');
            else if (line === 'detached') summary.detached = true;
        }

        summary.lane = inferLaneFromBranch(summary.branch);
        return summary;
    });
}

export function integrateLaneWorktree(options: {
    lane: string;
    projectDir?: string;
    worktreeRoot?: string;
    integrationBranch?: string;
}): WorktreeIntegrateResult {
    const repoRoot = resolveRepoRoot(options.projectDir ?? process.cwd());
    const worktreeRoot = resolveWorktreeRoot(repoRoot, options.worktreeRoot);
    const integrationBranch = options.integrationBranch ?? DEFAULT_INTEGRATION_BRANCH;
    const lane = sanitizeLaneName(options.lane);
    const laneBranch = branchNameForLane(lane);
    const integrationPath = path.join(worktreeRoot, 'integration');
    const lanePath = path.join(worktreeRoot, lane);

    if (!hasLocalBranch(repoRoot, laneBranch)) {
        throw new Error(`Lane branch "${laneBranch}" does not exist.`);
    }

    if (fs.existsSync(lanePath)) {
        ensureWorktreePathMatchesBranch(repoRoot, lanePath, laneBranch, `Lane worktree "${lane}"`);

        const laneDirty = runGit(repoRoot, ['status', '--porcelain'], { cwd: lanePath });
        if (laneDirty) {
            throw new Error(
                `Lane worktree "${lane}" at ${lanePath} has uncommitted changes. Commit or stash them before integrating.`,
            );
        }

        const laneHead = currentHeadAtPath(repoRoot, lanePath);
        const laneBranchHead = branchHead(repoRoot, laneBranch);
        if (laneHead !== laneBranchHead) {
            throw new Error(
                `Lane worktree "${lane}" at ${lanePath} is not aligned with branch "${laneBranch}". Refresh it before integrating.`,
            );
        }
    }

    if (!fs.existsSync(integrationPath)) {
        initWorktreeWorkspace({
            projectDir: repoRoot,
            worktreeRoot,
            integrationBranch,
        });
    } else {
        ensureWorktreePathMatchesBranch(repoRoot, integrationPath, integrationBranch, 'Integration worktree');
    }

    const dirty = runGit(repoRoot, ['status', '--porcelain'], { cwd: integrationPath });
    if (dirty) {
        throw new Error(
            `Integration worktree at ${integrationPath} has uncommitted changes. Clean it before integrating.`,
        );
    }

    const summary = runGit(
        repoRoot,
        ['merge', '--no-ff', '--no-edit', laneBranch],
        { cwd: integrationPath },
    );

    return {
        integrationPath,
        integrationBranch,
        lane,
        laneBranch,
        summary,
    };
}
