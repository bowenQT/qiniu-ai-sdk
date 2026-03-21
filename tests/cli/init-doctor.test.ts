import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('CLI init and doctor', () => {
    let tmpRoot: string;
    let originalExitCode: number | undefined;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qiniu-cli-'));
        originalExitCode = process.exitCode;
        process.exitCode = undefined;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
        vi.restoreAllMocks();
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('scaffolds the chat starter with subpath imports', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'chat-app');

        await runCLI(
            ['init', '--template', 'chat', '--dir', projectDir],
            { cwd: tmpRoot, packageRoot: process.cwd() },
        );

        const indexSource = fs.readFileSync(path.join(projectDir, 'src', 'index.ts'), 'utf8');
        const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')) as { name: string };

        expect(packageJson.name).toBe('chat-app');
        expect(indexSource).toContain("@bowenqt/qiniu-ai-sdk/qiniu");
        expect(indexSource).not.toContain("@bowenqt/qiniu-ai-sdk';");
    }, 30_000);

    it('rejects init when target directory is not empty', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'existing');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'keep.txt'), 'occupied', 'utf8');

        await expect(runCLI(
            ['init', '--template', 'chat', '--dir', projectDir],
            { cwd: tmpRoot, packageRoot: process.cwd() },
        )).rejects.toThrow('Target directory is not empty');
    });

    it('doctor fails when API key and required peer deps are missing', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'agent-app');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'agent-app' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), "import { generateText } from '@bowenqt/qiniu-ai-sdk/core';\n", 'utf8');

        await runCLI(
            ['doctor', '--template', 'agent', '--dir', projectDir],
            { cwd: tmpRoot, env: {}, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Missing QINIU_API_KEY'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Missing peer dependency "zod"'));
    });

    it('doctor reads .env and warns when starter dependencies are declared but not installed yet', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'fresh-agent');

        await runCLI(
            ['init', '--template', 'agent', '--dir', projectDir],
            { cwd: tmpRoot, packageRoot: process.cwd() },
        );

        fs.copyFileSync(path.join(projectDir, '.env.example'), path.join(projectDir, '.env'));
        process.exitCode = undefined;
        consoleLogSpy.mockClear();

        await runCLI(
            ['doctor', '--template', 'agent', '--dir', projectDir],
            { cwd: tmpRoot, env: {}, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[ok] QINIU_API_KEY is present.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('Peer dependency "zod" is declared in package.json but not installed yet. Run npm install.'),
        );
    });

    it('doctor warns when node-agent source still imports the root entry', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'node-agent-app');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'node_modules', 'zod'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'node_modules', 'ws'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'node-agent-app' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'node_modules', 'ws', 'package.json'), JSON.stringify({ name: 'ws' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), "import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';\n", 'utf8');

        await runCLI(
            ['doctor', '--template', 'node-agent', '--dir', projectDir],
            { cwd: tmpRoot, env: { QINIU_API_KEY: 'sk-test' }, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Root entry imports found'));
    });

    it('doctor warns when a non-node lane owns /node imports', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'runtime-lane-app');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'node_modules', 'zod'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'runtime-lane-app' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }), 'utf8');
        fs.writeFileSync(
            path.join(projectDir, 'src', 'index.ts'),
            "import { createNodeQiniuAI } from '@bowenqt/qiniu-ai-sdk/node';\nconsole.log(createNodeQiniuAI);\n",
            'utf8',
        );

        await runCLI(
            ['doctor', '--template', 'agent', '--lane', 'runtime', '--dir', projectDir],
            { cwd: tmpRoot, env: { QINIU_API_KEY: 'sk-test' }, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Detected worktree lane: runtime.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lane "runtime" should not own Node-only imports'));
    });

    it('doctor reports tracked phase2 policy state when the repo policy file exists', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'phase-policy-app');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, '.trellis', 'spec', 'sdk'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'phase-policy-app' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), "import { generateText } from '@bowenqt/qiniu-ai-sdk/core';\n", 'utf8');
        fs.writeFileSync(path.join(projectDir, '.trellis', 'spec', 'sdk', 'phase-policy.json'), JSON.stringify({
            version: 1,
            phases: {
                phase2: {
                    status: 'closeout-candidate',
                    allowNewPackages: false,
                    entryCriteria: [],
                    exitCriteria: [],
                    closeoutCriteria: ['Closeout report exists.'],
                    freezeTriggers: [],
                    promotionTriggers: [],
                    deferredToNextPhaseRules: [],
                    overrideRules: ['Tracked reopen package required.'],
                    closeoutReportPath: 'artifacts/phase2-closeout-report.md',
                },
            },
        }, null, 2), 'utf8');

        await runCLI(
            ['doctor', '--template', 'agent', '--dir', projectDir],
            { cwd: tmpRoot, env: { QINIU_API_KEY: 'sk-test' }, nodeVersion: 'v20.0.0' },
        );

        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('Tracked phase2 policy: closeout-candidate (allow new packages: no), closeout report artifacts/phase2-closeout-report.md.'),
        );
    });

    it('doctor reports maturity and validation metadata for imported public modules', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'maturity-app');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'node_modules', 'zod'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'maturity-app' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }), 'utf8');
        fs.writeFileSync(
            path.join(projectDir, 'src', 'index.ts'),
            [
                "import { createAgent } from '@bowenqt/qiniu-ai-sdk/core';",
                "import { ResponseAPI } from '@bowenqt/qiniu-ai-sdk/qiniu';",
                'console.log(createAgent, ResponseAPI);',
            ].join('\n'),
            'utf8',
        );

        await runCLI(
            ['doctor', '--template', 'agent', '--dir', projectDir],
            { cwd: tmpRoot, env: { QINIU_API_KEY: 'sk-test' }, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('createAgent imports detected (ga, contract'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('ResponseAPI usage detected (beta, unit, validated 2026-03-15, tracked decision experimental -> beta'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('tracked decision experimental -> beta'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('only applies when fresh nightly response-api evidence is present'),
        );
    });

    it('doctor reports maturity metadata for sdk client property usage', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'client-property-usage-app');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'client-property-usage-app' }), 'utf8');
        fs.writeFileSync(
            path.join(projectDir, 'src', 'index.ts'),
            [
                "import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';",
                "const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || 'sk-test' });",
                'console.log(client.batch, client.admin, client.response);',
            ].join('\n'),
            'utf8',
        );

        await runCLI(
            ['doctor', '--template', 'chat', '--dir', projectDir],
            { cwd: tmpRoot, env: { QINIU_API_KEY: 'sk-test' }, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('batch imports detected (beta, unit, validated 2026-03-15'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('admin imports detected (beta, unit, validated 2026-03-21'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('ResponseAPI imports detected (beta, unit, validated 2026-03-15, tracked decision experimental -> beta'),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('only applies when fresh nightly response-api evidence is present'),
        );
    });

    it('doctor succeeds for a clean node-agent project', async () => {
        const { runCLI } = await import('../../src/cli/skill-cli');
        const projectDir = path.join(tmpRoot, 'clean-node-agent');
        fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'node_modules', 'zod'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'node_modules', 'ws'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'clean-node-agent' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }), 'utf8');
        fs.writeFileSync(path.join(projectDir, 'node_modules', 'ws', 'package.json'), JSON.stringify({ name: 'ws' }), 'utf8');
        fs.writeFileSync(
            path.join(projectDir, 'src', 'index.ts'),
            "import { createNodeQiniuAI } from '@bowenqt/qiniu-ai-sdk/node';\nconst client = createNodeQiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });\nconsole.log(client);\n",
            'utf8',
        );

        await runCLI(
            ['doctor', '--template', 'node-agent', '--dir', projectDir],
            { cwd: tmpRoot, env: { QINIU_API_KEY: 'sk-test' }, nodeVersion: 'v20.0.0' },
        );

        expect(process.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[ok] QINIU_API_KEY is present.'));
    });
});
