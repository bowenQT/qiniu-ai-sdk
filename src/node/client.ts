import { QiniuAI } from '../qiniu/client';
import type { QiniuAIOptions } from '../qiniu/client';
import { Sandbox } from './sandbox';
import type { SandboxConfig } from './sandbox';

export interface NodeQiniuAIOptions extends QiniuAIOptions {
    /** Sandbox service configuration */
    sandbox?: SandboxConfig;
}

export type NodeQiniuAI = QiniuAI & { sandbox: Sandbox };

export function createNodeQiniuAI(options: NodeQiniuAIOptions): NodeQiniuAI {
    const { sandbox, ...clientOptions } = options;
    const client = new QiniuAI(clientOptions) as NodeQiniuAI;
    client.sandbox = new Sandbox(client, sandbox);
    return client;
}
