import { generateText } from '../core';
import { createNodeQiniuAI } from '../node';
import { QiniuAI } from '../qiniu';
import type { WorktreeLane } from './doctor';
import { getModuleMaturity } from '../lib/capability-registry';

export type LiveVerifyStatus = 'ok' | 'warn' | 'fail';

export interface LiveVerifyCheck {
    level: LiveVerifyStatus;
    message: string;
}

export interface LiveVerifyResult {
    status: LiveVerifyStatus;
    exitCode: 0 | 1 | 2;
    checks: LiveVerifyCheck[];
}

export interface LiveVerifyOptions {
    lane: WorktreeLane;
    env?: NodeJS.ProcessEnv;
    createQiniuClient?: (apiKey: string) => Pick<QiniuAI, 'chat' | 'file'>;
    createNodeClient?: (apiKey: string) => ReturnType<typeof createNodeQiniuAI>;
}

function addCheck(checks: LiveVerifyCheck[], level: LiveVerifyStatus, message: string): void {
    checks.push({ level, message });
}

function summarize(checks: LiveVerifyCheck[]): LiveVerifyStatus {
    if (checks.some((check) => check.level === 'fail')) return 'fail';
    if (checks.some((check) => check.level === 'warn')) return 'warn';
    return 'ok';
}

const LANE_MODULES: Record<Exclude<WorktreeLane, 'integration'>, string[]> = {
    foundation: ['chat'],
    'cloud-surface': ['chat', 'file', 'ResponseAPI'],
    runtime: ['generateText', 'createAgent', 'memory', 'guardrails'],
    'node-integrations': ['NodeMCPHost', 'sandbox', 'skills', 'auditLogger'],
    'dx-validation': ['chat', 'file', 'generateText'],
};

function addMaturityEvidence(checks: LiveVerifyCheck[], lane: WorktreeLane): void {
    if (lane === 'integration') return;

    for (const moduleName of LANE_MODULES[lane]) {
        const maturity = getModuleMaturity(moduleName);
        if (!maturity) continue;

        addCheck(
            checks,
            'ok',
            `${moduleName}: ${maturity.maturity.toUpperCase()} (${maturity.validationLevel}${maturity.validatedAt ? `, validated ${maturity.validatedAt}` : ''})`,
        );
    }
}

export async function verifyLiveLane(options: LiveVerifyOptions): Promise<LiveVerifyResult> {
    const checks: LiveVerifyCheck[] = [];
    const env = options.env ?? process.env;
    const apiKey = env.QINIU_API_KEY;
    const createQiniuClient = options.createQiniuClient ?? ((nextApiKey: string) => new QiniuAI({ apiKey: nextApiKey }));
    const createNodeClient = options.createNodeClient ?? ((nextApiKey: string) => createNodeQiniuAI({ apiKey: nextApiKey }));

    if (options.lane === 'foundation') {
        addCheck(
            checks,
            'warn',
            'foundation lane has no direct live API probe yet. Use docs/package/template smoke plus source sync evidence.',
        );
        return {
            status: summarize(checks),
            exitCode: 2,
            checks,
        };
    }

    addMaturityEvidence(checks, options.lane);

    if (!apiKey) {
        addCheck(checks, 'fail', 'Missing QINIU_API_KEY for live lane verification.');
        return {
            status: 'fail',
            exitCode: 1,
            checks,
        };
    }

    if (options.lane === 'cloud-surface' || options.lane === 'dx-validation' || options.lane === 'integration') {
        const client = createQiniuClient(apiKey);
        const result = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
            temperature: 0,
        });
        const content = result.choices[0]?.message?.content;
        addCheck(checks, 'ok', `Chat probe succeeded: ${typeof content === 'string' ? content : '[non-text]'}`);

        if (env.QINIU_LIVE_VERIFY_FILE_WORKFLOW === '1') {
            const fileClient = client.file as {
                create: (params: { file: string; filename: string; purpose: string }) => Promise<any>;
                waitForReady?: (file: any, options: { timeoutMs: number; intervalMs: number }) => Promise<any>;
                toContentPart?: (file: any) => { file: { file_id?: string; format?: string } };
            };
            const created = await fileClient.create({
                file: 'SGVsbG8=',
                filename: 'verify.txt',
                purpose: 'assistants',
            });
            const ready = created.status === 'ready' || !fileClient.waitForReady
                ? created
                : await fileClient.waitForReady(created, {
                    timeoutMs: 120_000,
                    intervalMs: 1000,
                });
            if (!fileClient.toContentPart) {
                throw new Error('File live probe requires toContentPart() support in the current SDK build');
            }
            const part = fileClient.toContentPart(ready);
            addCheck(
                checks,
                'ok',
                `File workflow probe succeeded: ${part.file.file_id}${part.file.format ? ` (${part.file.format})` : ''}`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_FILE_WORKFLOW not set. File/qfile live probe was skipped.',
            );
        }
    } else if (options.lane === 'runtime') {
        const client = createQiniuClient(apiKey);
        const result = await generateText({
            client,
            model: 'gemini-2.5-flash',
            prompt: 'Call the ping tool and answer with the returned word.',
            tools: {
                ping: {
                    description: 'Return pong',
                    parameters: { type: 'object', properties: {} },
                    execute: async () => ({ pong: 'pong' }),
                },
            },
            maxSteps: 2,
        });
        addCheck(checks, 'ok', `Runtime probe succeeded: ${result.text}`);
    } else if (options.lane === 'node-integrations') {
        const client = createNodeClient(apiKey);
        const result = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Reply with the single word node.' }],
            temperature: 0,
        });
        addCheck(checks, 'ok', `Node lane chat probe succeeded: ${result.choices[0]?.message?.content ?? ''}`);
        if (!env.QINIU_ACCESS_KEY || !env.QINIU_SECRET_KEY) {
            addCheck(
                checks,
                'warn',
                'QINIU_ACCESS_KEY / QINIU_SECRET_KEY not set. Kodo and some sandbox-adjacent live checks remain unavailable.',
            );
        }
    }

    const status = summarize(checks);
    return {
        status,
        exitCode: status === 'ok' ? 0 : status === 'warn' ? 2 : 1,
        checks,
    };
}
