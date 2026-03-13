/**
 * Sandbox E2E Tests
 *
 * These tests hit the real Qiniu Cloud Sandbox API.
 * Requirements:
 *   - Set QINIU_API_KEY environment variable
 *   - Run: QINIU_API_KEY=sk-xxx npx vitest run --config vitest.e2e.config.ts
 *
 * ⚠️  Each test creates real sandbox instances (billable resources).
 *     Always clean up with kill() in afterEach.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createNodeQiniuAI } from '../../src/node/client';
import type { SandboxInstance } from '../../src/modules/sandbox/sandbox';

const API_KEY = process.env.QINIU_API_KEY;
if (!API_KEY) {
    throw new Error('QINIU_API_KEY environment variable is required for e2e tests');
}

const client = createNodeQiniuAI({ apiKey: API_KEY });

// Track instances for cleanup
const instances: SandboxInstance[] = [];

afterEach(async () => {
    for (const inst of instances) {
        try { await inst.kill(); } catch { /* already dead */ }
    }
    instances.length = 0;
});

/**
 * Helper: create a sandbox and track for cleanup.
 */
async function createSandbox(): Promise<SandboxInstance> {
    const instance = await client.sandbox.createAndWait(
        { templateId: 'base' },
        { timeoutMs: 60_000 },
    );
    instances.push(instance);
    return instance;
}

// ============================================================================
// Lifecycle
// ============================================================================
describe('Sandbox Lifecycle (e2e)', () => {
    it('should create, wait for ready, and kill a sandbox', async () => {
        const instance = await createSandbox();

        expect(instance.sandboxId).toBeTruthy();
        expect(instance.domain).toBeTruthy();

        const running = await instance.isRunning();
        expect(running).toBe(true);

        const info = await instance.getInfo();
        expect(info.state).toBe('running');

        await instance.kill();
        instances.length = 0; // already killed
    });

    it('should pause and resume a sandbox', async () => {
        const instance = await createSandbox();

        await instance.pause();
        // After pause, envd health should fail
        const pausedRunning = await instance.isRunning();
        expect(pausedRunning).toBe(false);

        await instance.resume();
        // Wait a bit for envd to restart
        await new Promise(r => setTimeout(r, 3000));
        const resumedRunning = await instance.isRunning();
        expect(resumedRunning).toBe(true);
    });
});

// ============================================================================
// Commands
// ============================================================================
describe('Sandbox Commands (e2e)', () => {
    it('should run a simple command via run()', async () => {
        const instance = await createSandbox();

        const result = await instance.commands.run('echo "hello sandbox"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('hello sandbox');
    });

    it('should run a command with env vars and cwd', async () => {
        const instance = await createSandbox();

        const result = await instance.commands.run('pwd && echo $MY_VAR', {
            cwd: '/tmp',
            envs: { MY_VAR: 'test123' },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('/tmp');
        expect(result.stdout).toContain('test123');
    });

    it('should start a background command and wait', async () => {
        const instance = await createSandbox();
        const chunks: string[] = [];

        const handle = await instance.commands.start('echo streaming-test', {
            onStdout: (data) => chunks.push(data),
        });

        expect(handle.pid).toBeGreaterThan(0);

        const result = await handle.wait();
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('streaming-test');
        expect(chunks.length).toBeGreaterThan(0);
    });

    it('should list processes', async () => {
        const instance = await createSandbox();

        // Start a long-running process
        const handle = await instance.commands.start('sleep 30', { tag: 'e2e-sleep' });
        await new Promise(r => setTimeout(r, 1000)); // wait for process to start

        const procs = await instance.commands.listProcesses();
        expect(procs.length).toBeGreaterThan(0);

        const found = procs.find(p => p.tag === 'e2e-sleep');
        expect(found).toBeDefined();

        // Cleanup
        await instance.commands.killProcess(handle.pid);
    });
});

// ============================================================================
// Filesystem
// ============================================================================
describe('Sandbox Filesystem (e2e)', () => {
    it('should write, read, list, exists, and remove a file', async () => {
        const instance = await createSandbox();
        const testPath = '/tmp/e2e-test.txt';
        const content = 'Hello from e2e test!';

        // Write
        await instance.files.write(testPath, content);

        // Exists
        const exists = await instance.files.exists(testPath);
        expect(exists).toBe(true);

        // Read via SDK API
        const readContent = await instance.files.readText(testPath);
        expect(readContent).toBe(content);

        // List
        const entries = await instance.files.list('/tmp');
        const found = entries.find(e => e.name === 'e2e-test.txt');
        expect(found).toBeDefined();
        expect(found!.type).toBe('file');

        // Remove
        await instance.files.remove(testPath);
        const existsAfter = await instance.files.exists(testPath);
        expect(existsAfter).toBe(false);
    });

    it('should make directory', async () => {
        const instance = await createSandbox();

        await instance.files.makeDir('/tmp/e2e-dir');
        const exists = await instance.files.exists('/tmp/e2e-dir');
        expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
        const instance = await createSandbox();

        const exists = await instance.files.exists('/tmp/definitely-not-here-12345');
        expect(exists).toBe(false);
    });
});

// ============================================================================
// Templates (read-only, no creation to avoid resource leaks)
// ============================================================================
describe('Sandbox Templates (e2e)', () => {
    it('should list available templates', async () => {
        const templates = await client.sandbox.templates.list();
        expect(Array.isArray(templates)).toBe(true);
        // At minimum, public templates should exist
        if (templates.length > 0) {
            expect(templates[0].templateId).toBeTruthy();
            expect(templates[0].name).toBeTruthy();
        }
    });
});
