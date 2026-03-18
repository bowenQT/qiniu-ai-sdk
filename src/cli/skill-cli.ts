#!/usr/bin/env node
/**
 * qiniu-ai CLI — project initialization, diagnostics, and skill management.
 *
 * Usage:
 *   qiniu-ai init --template <chat|agent|node-agent> [--dir <target-dir>] [--name <project-name>]
 *   qiniu-ai doctor [--template <chat|agent|node-agent>] [--lane <name>] [--dir <project-dir>]
 *   qiniu-ai package <init|evidence|review|decision> [options]
 *   qiniu-ai worktree <init|spawn|status|integrate> [options]
 *   qiniu-ai verify live --lane <name>
 *   qiniu-ai verify eval --baseline <path> --candidate <path> [--json] [--out <path>]
 *   qiniu-ai verify gate [--lanes <lane1,lane2,...>] [--brief <path>] [--strict]
 *   qiniu-ai skill list [--dir <skills-dir>]
 *   qiniu-ai skill add <manifest-url> [--sha256 <hash>] [--auth <token>] [--allow-actions] [--dir <dir>]
 *   qiniu-ai skill verify [--fix] [--dir <dir>]
 *   qiniu-ai skill remove <name> [--dir <dir>]
 *
 * @module
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
    DEFAULT_ACTION_EXTENSIONS,
    DEFAULT_CONTENT_EXTENSIONS,
    SkillRegistry,
    SkillValidator,
} from '../node/skills';
import type { RemoteSkillSource } from '../node/skills';
import { doctorProject } from './doctor';
import type { WorktreeLane } from './doctor';
import { renderEvalGateMarkdown, runEvalGate } from './eval-gate';
import { initStarterProject, parseStarterTemplate } from './init';
import { parseLiveVerifyGateLanes, verifyLiveGate, verifyLiveLane } from './live-verify';
import {
    assertPhaseAllowsNewPackages,
    createChangePackage,
    createEvidenceBundle,
    createReviewPacket,
    defaultChangePackagePath,
    defaultEvidenceBundlePath,
    defaultPromotionDecisionJsonPath,
    defaultPromotionDecisionMarkdownPath,
    defaultTrackedPromotionDecisionPath,
    defaultReviewPacketPath,
    DEFAULT_PHASE,
    DEFAULT_PHASE_POLICY_PATH,
    parseChangePackageCategory,
    parsePackageLane,
    readJsonFile,
    readPhasePolicy,
    resolveDefaultPhase,
    renderPromotionDecisionMarkdown,
    renderReviewPacketMarkdown,
    resolveCurrentBranch,
    upsertPromotionDecision,
    writeJsonFile,
    writeTextFile,
    type ChangePackage,
    type EvidenceBundle,
    type PackageDecisionMaturity,
    type PromotionDecisionSet,
} from './package-workflow';
import {
    initWorktreeWorkspace,
    integrateLaneWorktree,
    listWorktrees,
    spawnLaneWorktree,
} from './worktree';

interface SkillLockEntry {
    name: string;
    version: string;
    manifestHash: string;
    files: Record<string, { sha256: string; size: number }>;
    allowActions: boolean;
    installedAt: string;
}

interface LockfileData {
    version: 1;
    skills: SkillLockEntry[];
}

export interface RunCLIOptions {
    packageRoot?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    nodeVersion?: string;
}

function readLockfileSafe(lockPath: string): SkillLockEntry[] {
    try {
        if (!fs.existsSync(lockPath)) return [];
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as LockfileData;
        return data.skills ?? [];
    } catch {
        return [];
    }
}

function writeLockfileSafe(lockPath: string, entries: SkillLockEntry[]): void {
    const data: LockfileData = { version: 1, skills: entries };
    fs.writeFileSync(lockPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function resolveSkillsDir(args: string[], cwd: string = process.cwd()): string {
    const dirIdx = args.indexOf('--dir');
    if (dirIdx >= 0 && args[dirIdx + 1]) {
        return path.resolve(cwd, args[dirIdx + 1]);
    }
    return path.resolve(cwd, '.agent/skills');
}

function resolveProjectDir(args: string[], cwd: string = process.cwd()): string {
    const dirIdx = args.indexOf('--dir');
    if (dirIdx >= 0 && args[dirIdx + 1]) {
        return path.resolve(cwd, args[dirIdx + 1]);
    }
    return cwd;
}

function getArgValue(args: string[], key: string): string | undefined {
    const idx = args.indexOf(key);
    if (idx === -1 || idx >= args.length - 1) return undefined;
    const value = args[idx + 1];
    if (value.startsWith('--')) {
        console.error(`Error: ${key} requires a value, got "${value}"`);
        process.exitCode = 1;
        return undefined;
    }
    return value;
}

function getArgValues(args: string[], key: string): string[] {
    const values: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] !== key) continue;
        const value = args[i + 1];
        if (!value || value.startsWith('--')) {
            console.error(`Error: ${key} requires a value, got "${value ?? ''}"`);
            process.exitCode = 1;
            return [];
        }
        values.push(value);
        i += 1;
    }
    return values;
}

function printMainUsage(): void {
    console.log('qiniu-ai CLI');
    console.log('');
    console.log('Usage:');
    console.log('  qiniu-ai init --template <chat|agent|node-agent> [--dir <target-dir>] [--name <project-name>]');
    console.log('  qiniu-ai doctor [--template <chat|agent|node-agent>] [--lane <name>] [--dir <project-dir>]');
    console.log('  qiniu-ai package <init|evidence|review|decision> [options]');
    console.log('  qiniu-ai worktree <init|spawn|status|integrate> [options]');
    console.log('  qiniu-ai verify live --lane <name>');
    console.log('  qiniu-ai verify eval --baseline <path> --candidate <path> [--json] [--out <path>]');
    console.log('  qiniu-ai verify gate [--lanes <lane1,lane2,...>] [--brief <path>] [--strict]');
    console.log('  qiniu-ai skill <list|add|verify|remove> [options]');
    console.log('');
    console.log('Top-level commands:');
    console.log('  init              Scaffold a starter project');
    console.log('  doctor            Validate environment, peer deps, and import choices');
    console.log('  package           Create bounded change-package artifacts');
    console.log('  worktree          Create and manage codex/vnext worktree lanes');
    console.log('  verify            Run lane-level verification helpers');
    console.log('  skill             Manage local and remote skills');
    console.log('');
    console.log('Skill shortcuts:');
    console.log('  qiniu-ai skill list');
    console.log('  qiniu-ai skill add <url>');
    console.log('  qiniu-ai skill verify [--fix]');
    console.log('  qiniu-ai skill remove <name>');
}

function printSkillUsage(): void {
    console.log('Usage: qiniu-ai skill <list|add|verify|remove> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  list              List installed skills');
    console.log('  add <url>         Install a remote skill from manifest URL');
    console.log('  verify [--fix]    Verify integrity / reconstruct lockfile');
    console.log('  remove <name>     Remove an installed skill');
    console.log('');
    console.log('Options:');
    console.log('  --dir <path>      Skills directory (default: .agent/skills)');
    console.log('  --sha256 <hash>   Verify manifest integrity (for add)');
    console.log('  --auth <token>    Authorization header (for add)');
    console.log('  --allow-actions   Allow installing skill actions (for add)');
}

function printInitUsage(): void {
    console.log('Usage: qiniu-ai init --template <chat|agent|node-agent> [--dir <target-dir>] [--name <project-name>]');
}

function printDoctorUsage(): void {
    console.log('Usage: qiniu-ai doctor [--template <chat|agent|node-agent>] [--lane <name>] [--dir <project-dir>]');
}

function printPackageUsage(): void {
    console.log(`Usage: qiniu-ai package init --lane <name> --topic <topic> --goal <goal> [--phase <name>] [--category <standard|promotion-sensitive>] [--success <text> ...]`);
    console.log('       qiniu-ai package evidence --brief <path> [options]');
    console.log('       qiniu-ai package review --brief <path> --evidence <path> [--out <path>] [--json]');
    console.log('       qiniu-ai package decision --brief <path> --module <name> --from <maturity> --to <maturity> --basis <text> --source <name> [options]');
    console.log('');
    console.log('Shared options:');
    console.log(`  --policy <path>           Phase policy file (default: ${DEFAULT_PHASE_POLICY_PATH})`);
    console.log('  --out <path>              Output path');
    console.log('');
    console.log('Init options:');
    console.log('  package branches should follow codex/<phase>/<lane>/<topic>');
    console.log('  --category <type>         Package category (default: standard)');
    console.log('  --success <text>          Repeatable success criterion');
    console.log('  --surface <name>          Repeatable touched surface');
    console.log('  --evidence <name>         Repeatable required evidence item');
    console.log('  --out-of-scope <text>     Repeatable out-of-scope note');
    console.log('  --merge-target <branch>   Expected merge target (default: main)');
    console.log('');
    console.log('Evidence options:');
    console.log('  --file <path>             Repeatable changed file');
    console.log('  --surface <name>          Repeatable changed surface');
    console.log('  --focused <text>          Repeatable focused verification item');
    console.log('  --gate <text>             Repeatable full gate status item');
    console.log('  --live <text>             Repeatable live verification delta');
    console.log('  --risk <text>             Repeatable deferred risk');
    console.log('  --artifact <path>         Repeatable artifact link');
    console.log('');
    console.log('Decision options:');
    console.log('  --append <path>           Existing promotion-decision JSON to update');
    console.log('  --decision-at <iso>       Override decision timestamp');
    console.log('  --tracked-out <path>      Override tracked promotion-decision JSON path');
    console.log('  --no-track                Skip writing the tracked promotion-decision JSON');
}

function printWorktreeUsage(): void {
    console.log('Usage: qiniu-ai worktree <init|spawn|status|integrate> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  init                      Create .worktrees/, add ignore rule, and create integration worktree');
    console.log('  spawn --lane <name>       Create a lane worktree from codex/vnext-integration');
    console.log('  status                    List worktrees, branches, and inferred lanes');
    console.log('  integrate --lane <name>   Merge a lane branch into codex/vnext-integration');
    console.log('');
    console.log('Options:');
    console.log('  --dir <path>              Repository root / project directory (default: cwd)');
    console.log('  --root <path>             Worktree directory root (default: .worktrees)');
    console.log('  --base <branch>           Base branch for init (default: current branch)');
    console.log('  --integration <branch>    Integration branch name (default: codex/vnext-integration)');
}

function printVerifyUsage(): void {
    console.log('Usage: qiniu-ai verify live --lane <name>');
    console.log('       qiniu-ai verify eval --baseline <path> --candidate <path> [--json] [--out <path>]');
    console.log('       qiniu-ai verify gate [--lanes <lane1,lane2,...>] [--brief <path>] [--profile <name>] [--policy <path>] [--strict] [--json] [--out <path>]');
}

function writeVerifyOutput(result: unknown, outputPath: string, cwd: string): string {
    const resolved = path.resolve(cwd, outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(result, null, 2) + '\n', 'utf8');
    return resolved;
}

export function commandList(skillsDir: string): string[] {
    const lockPath = path.join(skillsDir, 'skill-lock.json');
    const entries = readLockfileSafe(lockPath);

    if (entries.length === 0) {
        if (fs.existsSync(skillsDir)) {
            const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
                .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
                .map((d) => d.name);
            if (dirs.length > 0) {
                console.warn('No lockfile found. Showing directory scan. Run `skill verify --fix` to reconstruct.');
                return dirs.map((d) => `${d} (untracked)`);
            }
        }
        return [];
    }

    return entries.map((entry) => {
        const dirExists = fs.existsSync(path.join(skillsDir, entry.name));
        return `${entry.name}@${entry.version}${dirExists ? '' : ' MISSING'}`;
    });
}

export function commandVerify(skillsDir: string, fix: boolean = false): { valid: boolean; messages: string[] } {
    const lockPath = path.join(skillsDir, 'skill-lock.json');
    const messages: string[] = [];
    let valid = true;

    if (fix) {
        const entries = reconstructLockfile(skillsDir);
        writeLockfileSafe(lockPath, entries);
        messages.push(`Reconstructed lockfile with ${entries.length} skill(s).`);
        return { valid: true, messages };
    }

    const entries = readLockfileSafe(lockPath);
    if (entries.length === 0) {
        messages.push('No lockfile found. Run `skill verify --fix` to reconstruct.');
        return { valid: false, messages };
    }

    for (const entry of entries) {
        const skillDir = path.join(skillsDir, entry.name);
        if (!fs.existsSync(skillDir)) {
            messages.push(`MISSING: ${entry.name} — directory not found`);
            valid = false;
            continue;
        }

        const validation = validateSync(skillDir, entry);
        if (!validation.valid) {
            for (const err of validation.errors) {
                messages.push(`${entry.name}: ${err}`);
            }
            valid = false;
            continue;
        }
    }

    if (valid) {
        messages.push(`All ${entries.length} skill(s) verified.`);
    }

    return { valid, messages };
}

function validateSync(skillDir: string, entry: SkillLockEntry): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validator = new SkillValidator();
    const allowedExtensions = entry.allowActions
        ? [...DEFAULT_CONTENT_EXTENSIONS, ...DEFAULT_ACTION_EXTENSIONS]
        : [...DEFAULT_CONTENT_EXTENSIONS];

    for (const [filePath, expected] of Object.entries(entry.files)) {
        const fullPath = path.resolve(skillDir, filePath);

        if (!validator.isWithinRoot(fullPath, skillDir)) {
            errors.push(`Path traversal blocked: "${filePath}"`);
            continue;
        }

        if (!validator.isAllowedExtension(filePath, allowedExtensions)) {
            const ext = path.extname(filePath).toLowerCase();
            errors.push(`Blocked extension: "${filePath}" ("${ext}" not in whitelist)`);
            continue;
        }

        if (!fs.existsSync(fullPath)) {
            errors.push(`Missing file: ${filePath}`);
            continue;
        }

        const actual = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
        if (actual !== expected.sha256) {
            errors.push(`SHA256 mismatch: ${filePath}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

export function commandRemove(skillsDir: string, name: string): string {
    const skillDir = path.join(skillsDir, name);
    const lockPath = path.join(skillsDir, 'skill-lock.json');
    const hadDir = fs.existsSync(skillDir);

    if (hadDir) {
        fs.rmSync(skillDir, { recursive: true, force: true });
    }

    const entries = readLockfileSafe(lockPath);
    const filtered = entries.filter((entry) => entry.name !== name);
    const wasTracked = filtered.length !== entries.length;

    if (wasTracked) {
        writeLockfileSafe(lockPath, filtered);
        return `Removed skill "${name}"`;
    }

    if (hadDir) {
        return `Removed skill "${name}" (was untracked — no lockfile entry)`;
    }

    return `Skill "${name}" not found`;
}

function reconstructLockfile(skillsDir: string): SkillLockEntry[] {
    if (!fs.existsSync(skillsDir)) return [];

    const entries: SkillLockEntry[] = [];
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'));

    for (const dir of dirs) {
        const manifestPath = path.join(skillsDir, dir.name, 'skill.json');
        if (!fs.existsSync(manifestPath)) continue;

        try {
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent) as {
                name?: string;
                version?: string;
                files?: Record<string, unknown>;
                actions?: unknown[];
            };

            const filesMap: Record<string, { sha256: string; size: number }> = {};
            if (manifest.files) {
                for (const [filePath] of Object.entries(manifest.files)) {
                    const fullPath = path.join(skillsDir, dir.name, filePath);
                    if (!fs.existsSync(fullPath)) continue;

                    const content = fs.readFileSync(fullPath);
                    filesMap[filePath] = {
                        sha256: crypto.createHash('sha256').update(content).digest('hex'),
                        size: content.length,
                    };
                }
            }

            entries.push({
                name: manifest.name ?? dir.name,
                version: manifest.version ?? '0.0.0',
                manifestHash: crypto.createHash('sha256').update(manifestContent, 'utf-8').digest('hex'),
                files: filesMap,
                allowActions: Array.isArray(manifest.actions) && manifest.actions.length > 0,
                installedAt: new Date().toISOString(),
            });
        } catch {
            // Skip unparseable manifests.
        }
    }

    return entries;
}

function warnDependencies(deps: string[]): void {
    console.warn(
        `This skill declares ${deps.length} unresolved dependencies:\n` +
        deps.map((dep) => `   - ${dep}`).join('\n') + '\n' +
        'Automatic dependency resolution is not yet supported.\n' +
        'The skill may not work correctly if dependencies are missing.',
    );
}

async function commandAdd(
    url: string,
    opts: { dir: string; allowActions: boolean; sha256?: string; auth?: string },
): Promise<void> {
    const registry = new SkillRegistry({
        skillsDir: opts.dir,
        allowRemote: true,
        allowedDomains: [],
    });

    const source: RemoteSkillSource = {
        url,
        integrityHash: opts.sha256 ? `sha256:${opts.sha256}` : undefined,
        authorization: opts.auth,
    };
    const name = await registry.registerRemoteAndGetName(source);
    const skill = registry.get(name);

    if (skill?.manifest.dependencies?.length) {
        warnDependencies(skill.manifest.dependencies);
    }

    await registry.installRemote(name, {
        installDir: opts.dir,
        allowActions: opts.allowActions,
    });

    console.log(`Installed "${name}" v${skill?.manifest.version ?? 'unknown'}`);
}

async function runInitCommand(args: string[], options: RunCLIOptions): Promise<void> {
    const templateValue = getArgValue(args, '--template');
    if (process.exitCode === 1 || !templateValue) {
        printInitUsage();
        process.exitCode = 1;
        return;
    }

    const template = parseStarterTemplate(templateValue);
    const cwd = options.cwd ?? process.cwd();
    const targetDir = resolveProjectDir(args, cwd);
    const projectName = getArgValue(args, '--name');
    if (process.exitCode === 1) return;

    const result = initStarterProject({
        template,
        targetDir,
        projectName,
        packageRoot: options.packageRoot ?? cwd,
    });

    console.log(`Created ${template} starter in ${result.targetDir}`);
    console.log('Generated files:');
    for (const file of result.files) {
        console.log(`  ${file}`);
    }
}

async function runDoctorCommand(args: string[], options: RunCLIOptions): Promise<void> {
    const cwd = options.cwd ?? process.cwd();
    const templateValue = getArgValue(args, '--template');
    const lane = getArgValue(args, '--lane');
    if (process.exitCode === 1) return;

    const template = templateValue ? parseStarterTemplate(templateValue) : 'agent';
    const result = doctorProject({
        template,
        projectDir: resolveProjectDir(args, cwd),
        env: options.env,
        nodeVersion: options.nodeVersion,
        lane: lane as WorktreeLane | undefined,
    });

    for (const check of result.checks) {
        console.log(`[${check.level}] ${check.message}`);
    }
    process.exitCode = result.exitCode;
}

function resolvePhasePolicyPath(args: string[], cwd: string, projectDir: string): string {
    const policyValue = getArgValue(args, '--policy');
    if (process.exitCode === 1) {
        return path.resolve(projectDir, DEFAULT_PHASE_POLICY_PATH);
    }
    return path.resolve(policyValue ? cwd : projectDir, policyValue ?? DEFAULT_PHASE_POLICY_PATH);
}

function parseDecisionMaturity(value: string): PackageDecisionMaturity {
    if (value === 'ga' || value === 'beta' || value === 'experimental') {
        return value;
    }
    throw new Error(`Invalid maturity "${value}". Expected ga, beta, or experimental.`);
}

async function runPackageCommand(args: string[], options: RunCLIOptions): Promise<void> {
    const subcommand = args[1];
    const cwd = options.cwd ?? process.cwd();
    const projectDir = resolveProjectDir(args, cwd);

    switch (subcommand) {
        case 'init': {
            const laneValue = getArgValue(args, '--lane');
            const topic = getArgValue(args, '--topic');
            const goal = getArgValue(args, '--goal');
            const requestedPhase = getArgValue(args, '--phase');
            const categoryValue = getArgValue(args, '--category');
            const mergeTarget = getArgValue(args, '--merge-target');
            const outputPath = getArgValue(args, '--out');
            const successCriteria = getArgValues(args, '--success');
            const touchedSurfaces = getArgValues(args, '--surface');
            const requiredEvidence = getArgValues(args, '--evidence');
            const explicitlyOutOfScope = getArgValues(args, '--out-of-scope');
            const policyPath = resolvePhasePolicyPath(args, cwd, projectDir);

            if (process.exitCode === 1 || !laneValue || !topic || !goal) {
                printPackageUsage();
                process.exitCode = 1;
                return;
            }

            const lane = parsePackageLane(laneValue);
            const category = categoryValue ? parseChangePackageCategory(categoryValue) : undefined;
            const policy = readPhasePolicy(policyPath);
            const phase = requestedPhase ?? resolveDefaultPhase(policy);
            assertPhaseAllowsNewPackages(policy, phase);

            const changePackage = createChangePackage({
                phase,
                ownerLane: lane,
                category,
                topic,
                goal,
                successCriteria,
                touchedSurfaces,
                requiredEvidence,
                explicitlyOutOfScope,
                expectedMergeTarget: mergeTarget,
                branch: resolveCurrentBranch(projectDir),
                worktreePath: projectDir,
            });

            const destination = outputPath
                ? path.resolve(cwd, outputPath)
                : defaultChangePackagePath(projectDir, changePackage);
            const written = writeJsonFile(destination, changePackage);
            console.log(`Wrote change package: ${written}`);
            return;
        }

        case 'evidence': {
            const briefPath = getArgValue(args, '--brief');
            const outputPath = getArgValue(args, '--out');
            const changedFiles = getArgValues(args, '--file');
            const changedSurfaces = getArgValues(args, '--surface');
            const focusedVerification = getArgValues(args, '--focused');
            const fullGateStatus = getArgValues(args, '--gate');
            const liveVerifyDelta = getArgValues(args, '--live');
            const deferredRisks = getArgValues(args, '--risk');
            const artifactLinks = getArgValues(args, '--artifact');

            if (process.exitCode === 1 || !briefPath) {
                printPackageUsage();
                process.exitCode = 1;
                return;
            }

            const changePackage = readJsonFile<ChangePackage>(path.resolve(cwd, briefPath));
            const evidence = createEvidenceBundle({
                changePackage,
                changedFiles,
                changedSurfaces,
                focusedVerification,
                fullGateStatus,
                liveVerifyDelta,
                deferredRisks,
                artifactLinks,
            });

            const destination = outputPath
                ? path.resolve(cwd, outputPath)
                : defaultEvidenceBundlePath(projectDir, changePackage.packageId);
            const written = writeJsonFile(destination, evidence);
            console.log(`Wrote evidence bundle: ${written}`);
            return;
        }

        case 'review': {
            const briefPath = getArgValue(args, '--brief');
            const evidencePath = getArgValue(args, '--evidence');
            const outputPath = getArgValue(args, '--out');
            const jsonMode = args.includes('--json');

            if (process.exitCode === 1 || !briefPath || !evidencePath) {
                printPackageUsage();
                process.exitCode = 1;
                return;
            }

            const changePackage = readJsonFile<ChangePackage>(path.resolve(cwd, briefPath));
            const evidence = readJsonFile<EvidenceBundle>(path.resolve(cwd, evidencePath));
            const packet = createReviewPacket(changePackage, evidence);

            if (jsonMode) {
                console.log(JSON.stringify(packet, null, 2));
            } else {
                console.log(renderReviewPacketMarkdown(changePackage, packet));
            }

            if (outputPath) {
                const destination = path.resolve(cwd, outputPath);
                if (jsonMode) {
                    writeJsonFile(destination, packet);
                } else {
                    writeTextFile(destination, renderReviewPacketMarkdown(changePackage, packet));
                    console.log(`Wrote review packet: ${destination}`);
                }
            } else if (!jsonMode) {
                const destination = defaultReviewPacketPath(projectDir, changePackage.packageId);
                writeTextFile(destination, renderReviewPacketMarkdown(changePackage, packet));
                console.log(`Wrote review packet: ${destination}`);
            }
            return;
        }

        case 'decision': {
            const briefPath = getArgValue(args, '--brief');
            const moduleName = getArgValue(args, '--module');
            const fromValue = getArgValue(args, '--from');
            const toValue = getArgValue(args, '--to');
            const outputPath = getArgValue(args, '--out');
            const appendPath = getArgValue(args, '--append');
            const trackedOutputPath = getArgValue(args, '--tracked-out');
            const source = getArgValue(args, '--source');
            const decisionAt = getArgValue(args, '--decision-at');
            const evidenceBasis = getArgValues(args, '--basis');

            if (
                process.exitCode === 1 ||
                !briefPath ||
                !moduleName ||
                !fromValue ||
                !toValue ||
                !source ||
                evidenceBasis.length === 0
            ) {
                printPackageUsage();
                process.exitCode = 1;
                return;
            }

            const changePackage = readJsonFile<ChangePackage>(path.resolve(cwd, briefPath));
            const existing = appendPath
                ? readJsonFile<PromotionDecisionSet>(path.resolve(cwd, appendPath))
                : undefined;
            const decisionSet = upsertPromotionDecision(existing, changePackage, {
                module: moduleName,
                oldMaturity: parseDecisionMaturity(fromValue),
                newMaturity: parseDecisionMaturity(toValue),
                evidenceBasis,
                decisionSource: source,
                decisionAt: decisionAt ?? new Date().toISOString(),
            });

            const jsonDestination = outputPath
                ? path.resolve(cwd, outputPath)
                : defaultPromotionDecisionJsonPath(projectDir, changePackage.packageId);
            const markdownDestination = defaultPromotionDecisionMarkdownPath(projectDir, changePackage.packageId);
            const trackedDestination = trackedOutputPath
                ? path.resolve(cwd, trackedOutputPath)
                : defaultTrackedPromotionDecisionPath(projectDir, changePackage.packageId);

            writeJsonFile(jsonDestination, decisionSet);
            writeTextFile(markdownDestination, renderPromotionDecisionMarkdown(decisionSet));
            if (!args.includes('--no-track')) {
                writeJsonFile(trackedDestination, decisionSet);
                console.log(`Wrote tracked promotion decisions: ${trackedDestination}`);
            }
            console.log(`Wrote promotion decisions: ${jsonDestination}`);
            console.log(`Wrote promotion decision summary: ${markdownDestination}`);
            return;
        }

        default:
            printPackageUsage();
            return;
    }
}

async function runWorktreeCommand(args: string[], options: RunCLIOptions): Promise<void> {
    const subcommand = args[1];
    const cwd = options.cwd ?? process.cwd();
    const projectDir = resolveProjectDir(args, cwd);
    const worktreeRoot = getArgValue(args, '--root');
    const integrationBranch = getArgValue(args, '--integration');
    if (process.exitCode === 1) return;

    switch (subcommand) {
        case 'init': {
            const baseBranch = getArgValue(args, '--base');
            if (process.exitCode === 1) return;
            const result = initWorktreeWorkspace({
                projectDir,
                worktreeRoot,
                baseBranch,
                integrationBranch,
            });
            console.log(
                `${result.created ? 'Created' : 'Using'} integration worktree: ${result.integrationPath}`,
            );
            console.log(`Integration branch: ${result.integrationBranch}`);
            return;
        }

        case 'spawn': {
            const lane = getArgValue(args, '--lane');
            if (process.exitCode === 1 || !lane) {
                printWorktreeUsage();
                process.exitCode = 1;
                return;
            }
            const result = spawnLaneWorktree({
                lane,
                projectDir,
                worktreeRoot,
                integrationBranch,
            });
            console.log(`${result.created ? 'Created' : 'Using'} lane worktree: ${result.path}`);
            console.log(`Lane branch: ${result.branch}`);
            return;
        }

        case 'status': {
            const worktrees = listWorktrees(projectDir);
            if (worktrees.length === 0) {
                console.log('No worktrees found.');
                return;
            }
            for (const worktree of worktrees) {
                const branch = worktree.branch ?? '(detached)';
                const lane = worktree.lane ? ` lane=${worktree.lane}` : '';
                console.log(`${worktree.path} :: ${branch}${lane}`);
            }
            return;
        }

        case 'integrate': {
            const lane = getArgValue(args, '--lane');
            if (process.exitCode === 1 || !lane) {
                printWorktreeUsage();
                process.exitCode = 1;
                return;
            }
            const result = integrateLaneWorktree({
                lane,
                projectDir,
                worktreeRoot,
                integrationBranch,
            });
            console.log(`Merged ${result.laneBranch} into ${result.integrationBranch}`);
            if (result.summary) {
                console.log(result.summary);
            }
            return;
        }

        default:
            printWorktreeUsage();
            return;
    }
}

async function runVerifyCommand(args: string[], options: RunCLIOptions): Promise<void> {
    const subcommand = args[1];
    const cwd = options.cwd ?? process.cwd();
    const outputPath = getArgValue(args, '--out');
    const jsonMode = args.includes('--json');
    if (process.exitCode === 1) return;

    let result;
    if (subcommand === 'live') {
        const lane = getArgValue(args, '--lane');
        if (process.exitCode === 1 || !lane) {
            printVerifyUsage();
            process.exitCode = 1;
            return;
        }

        result = await verifyLiveLane({
            lane: lane as WorktreeLane,
            env: options.env,
        });
    } else if (subcommand === 'eval') {
        const baselinePath = getArgValue(args, '--baseline');
        const candidatePath = getArgValue(args, '--candidate');
        if (process.exitCode === 1 || !baselinePath || !candidatePath) {
            printVerifyUsage();
            process.exitCode = 1;
            return;
        }

        result = await runEvalGate({
            baselinePath: path.resolve(cwd, baselinePath),
            candidatePath: path.resolve(cwd, candidatePath),
        });
    } else if (subcommand === 'gate') {
        const lanesArg = getArgValue(args, '--lanes');
        const briefPath = getArgValue(args, '--brief');
        const profile = getArgValue(args, '--profile');
        const policyPath = getArgValue(args, '--policy');
        if (process.exitCode === 1) return;

        const brief = briefPath ? readJsonFile<ChangePackage>(path.resolve(cwd, briefPath)) : undefined;
        const briefLane = brief ? ({
            foundation: 'foundation',
            'cloud-surface': 'cloud-surface',
            runtime: 'runtime',
            'runtime-hardening': 'runtime',
            'node-integrations': 'node-integrations',
            'dx-validation': 'dx-validation',
        } as const)[brief.ownerLane] : undefined;

        result = await verifyLiveGate({
            lanes: parseLiveVerifyGateLanes(lanesArg ?? briefLane),
            strict: args.includes('--strict'),
            packageBriefPath: briefPath ? path.resolve(cwd, briefPath) : undefined,
            policyProfile: profile,
            policyPath,
            env: options.env,
        });
    } else {
        printVerifyUsage();
        process.exitCode = 1;
        return;
    }

    if (jsonMode && !outputPath) {
        console.log(JSON.stringify(result, null, 2));
    } else if (subcommand === 'eval' && !outputPath) {
        console.log(renderEvalGateMarkdown(result as Awaited<ReturnType<typeof runEvalGate>>));
    } else if (subcommand !== 'eval') {
        for (const check of (result as Awaited<ReturnType<typeof verifyLiveGate>>).checks) {
            console.log(`[${check.level}] ${check.message}`);
        }
    }

    if (outputPath) {
        const written = writeVerifyOutput(result, outputPath, cwd);
        console.log(`Wrote verification artifact: ${written}`);
    }
    process.exitCode = 'exitCode' in result
        ? result.exitCode
        : (result.status === 'fail' ? 1 : 0);
}

async function runSkillCommand(args: string[], options: RunCLIOptions): Promise<void> {
    const subcommand = args[1];
    const cwd = options.cwd ?? process.cwd();
    const skillsDir = resolveSkillsDir(args, cwd);

    switch (subcommand) {
        case 'list': {
            const items = commandList(skillsDir);
            if (items.length === 0) {
                console.log('No skills installed.');
            } else {
                console.log('Installed skills:');
                for (const item of items) {
                    console.log(`  ${item}`);
                }
            }
            return;
        }

        case 'verify': {
            const fix = args.includes('--fix');
            const result = commandVerify(skillsDir, fix);
            for (const msg of result.messages) {
                console.log(msg);
            }
            process.exitCode = result.valid ? 0 : 1;
            return;
        }

        case 'remove': {
            const name = args[2];
            if (!name || name.startsWith('--')) {
                console.error('Usage: qiniu-ai skill remove <name>');
                process.exitCode = 1;
                return;
            }
            console.log(commandRemove(skillsDir, name));
            return;
        }

        case 'add': {
            const url = args[2];
            if (!url || url.startsWith('--')) {
                console.error('Usage: qiniu-ai skill add <manifest-url> [--sha256 <hash>] [--auth <token>] [--allow-actions]');
                process.exitCode = 1;
                return;
            }
            const sha256 = getArgValue(args, '--sha256');
            const auth = getArgValue(args, '--auth');
            if (process.exitCode === 1) return;

            try {
                await commandAdd(url, {
                    dir: skillsDir,
                    allowActions: args.includes('--allow-actions'),
                    sha256,
                    auth,
                });
            } catch (error) {
                console.error(`Failed to install skill: ${(error as Error).message}`);
                process.exitCode = 1;
            }
            return;
        }

        default:
            printSkillUsage();
            return;
    }
}

export async function runCLI(args: string[], options: RunCLIOptions = {}): Promise<void> {
    process.exitCode = undefined;

    if (args.length === 0 || args[0] === 'help' || args.includes('--help')) {
        printMainUsage();
        return;
    }

    switch (args[0]) {
        case 'init':
            await runInitCommand(args, options);
            return;
        case 'doctor':
            await runDoctorCommand(args, options);
            return;
        case 'package':
            await runPackageCommand(args, options);
            return;
        case 'worktree':
            await runWorktreeCommand(args, options);
            return;
        case 'verify':
            await runVerifyCommand(args, options);
            return;
        case 'skill':
            await runSkillCommand(args, options);
            return;
        default:
            printMainUsage();
            return;
    }
}

if (typeof require !== 'undefined' && require.main === module) {
    void runCLI(process.argv.slice(2));
}
