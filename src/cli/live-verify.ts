import { generateText } from '../core';
import { createNodeQiniuAI } from '../node';
import { QiniuAI } from '../qiniu';
import type { WorktreeLane } from './doctor';

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
}

function addCheck(checks: LiveVerifyCheck[], level: LiveVerifyStatus, message: string): void {
    checks.push({ level, message });
}

function summarize(checks: LiveVerifyCheck[]): LiveVerifyStatus {
    if (checks.some((check) => check.level === 'fail')) return 'fail';
    if (checks.some((check) => check.level === 'warn')) return 'warn';
    return 'ok';
}

export async function verifyLiveLane(options: LiveVerifyOptions): Promise<LiveVerifyResult> {
    const checks: LiveVerifyCheck[] = [];
    const env = options.env ?? process.env;
    const apiKey = env.QINIU_API_KEY;

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

    if (!apiKey) {
        addCheck(checks, 'fail', 'Missing QINIU_API_KEY for live lane verification.');
        return {
            status: 'fail',
            exitCode: 1,
            checks,
        };
    }

    if (options.lane === 'cloud-surface' || options.lane === 'dx-validation' || options.lane === 'integration') {
        const client = new QiniuAI({ apiKey });
        const result = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
            temperature: 0,
        });
        const content = result.choices[0]?.message?.content;
        addCheck(checks, 'ok', `Chat probe succeeded: ${typeof content === 'string' ? content : '[non-text]'}`);
    } else if (options.lane === 'runtime') {
        const client = new QiniuAI({ apiKey });
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
        const client = createNodeQiniuAI({ apiKey });
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
