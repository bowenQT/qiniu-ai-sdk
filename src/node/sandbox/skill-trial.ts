import type { RegisteredSkill } from '../skills/registry';
import {
    resolveSkillTrialCommand,
    type SkillSandboxValidationResult,
    type SkillTrialPolicy,
    type SkillTrialValidator,
} from '../skills/trial';
import type { CreateSandboxParams } from './types';
import type { SandboxInstance } from './sandbox';

export interface SandboxTrialClient {
    createAndWait(
        params: CreateSandboxParams,
        opts?: { timeoutMs?: number; intervalMs?: number },
    ): Promise<SandboxInstance>;
}

export interface QiniuSandboxTrialAdapterOptions {
    sandbox: SandboxTrialClient;
    defaultTemplateId?: string;
    cleanupMode?: 'kill' | 'pause';
}

export class QiniuSandboxTrialAdapter implements SkillTrialValidator {
    private readonly cleanupMode: 'kill' | 'pause';

    constructor(private readonly options: QiniuSandboxTrialAdapterOptions) {
        this.cleanupMode = options.cleanupMode ?? 'kill';
    }

    async validate(skill: RegisteredSkill, policy?: SkillTrialPolicy): Promise<SkillSandboxValidationResult> {
        const command = resolveSkillTrialCommand(skill, policy);
        if (!command) {
            return {
                status: 'skipped',
                message: 'No entry command available for sandbox validation.',
            };
        }

        const instance = await this.options.sandbox.createAndWait({
            templateId: policy?.sandboxTemplateId ?? this.options.defaultTemplateId ?? 'base',
            timeoutMs: policy?.timeoutMs,
        }, {
            timeoutMs: policy?.timeoutMs,
        });

        const startedAt = Date.now();
        try {
            const result = await instance.commands.run(command, {
                timeoutMs: policy?.timeoutMs,
            });

            return {
                status: result.exitCode === 0 ? 'passed' : 'failed',
                command,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                durationMs: Date.now() - startedAt,
                sandboxId: instance.sandboxId,
                message: result.error || undefined,
            };
        } finally {
            if (this.cleanupMode === 'pause') {
                await instance.pause();
            } else {
                await instance.kill();
            }
        }
    }
}
