import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    initWorktreeWorkspace,
    integrateLaneWorktree,
    listWorktrees,
    spawnLaneWorktree,
} from '../../src/cli/worktree';

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
    }).trim();
}

describe('CLI worktree workflow', () => {
    let repoDir: string;

    beforeEach(() => {
        repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiniu-worktree-'));
        git(repoDir, 'init');
        git(repoDir, 'config', 'user.email', 'codex@example.com');
        git(repoDir, 'config', 'user.name', 'Codex');
        fs.writeFileSync(path.join(repoDir, 'README.md'), '# temp repo\n', 'utf8');
        git(repoDir, 'add', 'README.md');
        git(repoDir, 'commit', '-m', 'init');
        git(repoDir, 'branch', '-M', 'main');
    });

    afterEach(() => {
        fs.rmSync(repoDir, { recursive: true, force: true });
    });

    it('initializes an ignored integration worktree and spawns lane worktrees', () => {
        const initResult = initWorktreeWorkspace({ projectDir: repoDir });
        expect(initResult.integrationBranch).toBe('codex/vnext-integration');
        expect(fs.existsSync(path.join(repoDir, '.worktrees', 'integration'))).toBe(true);

        const gitignore = fs.readFileSync(path.join(repoDir, '.gitignore'), 'utf8');
        expect(gitignore).toContain('.worktrees/');

        const laneResult = spawnLaneWorktree({ projectDir: repoDir, lane: 'cloud-surface' });
        expect(laneResult.branch).toBe('codex/vnext/cloud-surface');
        expect(fs.existsSync(path.join(repoDir, '.worktrees', 'cloud-surface'))).toBe(true);

        const branches = git(repoDir, 'branch', '--format=%(refname:short)').split('\n');
        expect(branches).toContain('codex/vnext-integration');
        expect(branches).toContain('codex/vnext/cloud-surface');
    });

    it('lists inferred lanes from git worktrees', () => {
        initWorktreeWorkspace({ projectDir: repoDir });
        spawnLaneWorktree({ projectDir: repoDir, lane: 'runtime' });

        const worktrees = listWorktrees(repoDir);
        const integration = worktrees.find((item) => item.lane === 'integration');
        const runtime = worktrees.find((item) => item.lane === 'runtime');

        expect(integration?.branch).toBe('codex/vnext-integration');
        expect(runtime?.branch).toBe('codex/vnext/runtime');
    });

    it('integrates a lane branch into the integration branch', () => {
        const initResult = initWorktreeWorkspace({ projectDir: repoDir });
        const laneResult = spawnLaneWorktree({ projectDir: repoDir, lane: 'dx-validation' });

        fs.writeFileSync(path.join(laneResult.path, 'lane.txt'), 'hello from lane\n', 'utf8');
        git(laneResult.path, 'add', 'lane.txt');
        git(laneResult.path, 'commit', '-m', 'lane work');

        const result = integrateLaneWorktree({ projectDir: repoDir, lane: 'dx-validation' });
        expect(result.summary).toContain('Merge made by the');
        expect(fs.existsSync(path.join(initResult.integrationPath, 'lane.txt'))).toBe(true);
    });

    it('rejects reusing an integration worktree path on the wrong branch', () => {
        const initResult = initWorktreeWorkspace({ projectDir: repoDir });
        git(initResult.integrationPath, 'switch', '-c', 'codex/tmp-integration');

        expect(() => initWorktreeWorkspace({ projectDir: repoDir })).toThrow(
            'Integration worktree at',
        );
        expect(() => integrateLaneWorktree({ projectDir: repoDir, lane: 'runtime' })).toThrow(
            'Lane branch "codex/vnext/runtime" does not exist.',
        );
    });

    it('rejects reusing a lane worktree path on the wrong branch', () => {
        initWorktreeWorkspace({ projectDir: repoDir });
        const laneResult = spawnLaneWorktree({ projectDir: repoDir, lane: 'runtime' });
        git(laneResult.path, 'switch', '-c', 'codex/tmp-runtime');

        expect(() => spawnLaneWorktree({ projectDir: repoDir, lane: 'runtime' })).toThrow(
            'Lane worktree "runtime"',
        );
    });

    it('rejects integrating into an integration worktree that drifted to another branch', () => {
        const initResult = initWorktreeWorkspace({ projectDir: repoDir });
        const laneResult = spawnLaneWorktree({ projectDir: repoDir, lane: 'dx-validation' });
        fs.writeFileSync(path.join(laneResult.path, 'lane.txt'), 'hello from lane\n', 'utf8');
        git(laneResult.path, 'add', 'lane.txt');
        git(laneResult.path, 'commit', '-m', 'lane work');
        git(initResult.integrationPath, 'switch', '-c', 'codex/tmp-integration');

        expect(() => integrateLaneWorktree({ projectDir: repoDir, lane: 'dx-validation' })).toThrow(
            'Integration worktree at',
        );
    });

    it('rejects integrating a lane worktree with uncommitted changes', () => {
        initWorktreeWorkspace({ projectDir: repoDir });
        const laneResult = spawnLaneWorktree({ projectDir: repoDir, lane: 'runtime' });

        fs.writeFileSync(path.join(laneResult.path, 'dirty.txt'), 'not committed\n', 'utf8');

        expect(() => integrateLaneWorktree({ projectDir: repoDir, lane: 'runtime' })).toThrow(
            'has uncommitted changes',
        );
    });
});
