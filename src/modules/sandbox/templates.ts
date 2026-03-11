/**
 * Template Management — CRUD operations for sandbox templates.
 * Templates are used to create sandboxes with pre-configured environments.
 */
import type { ChildTransport } from '../../lib/child-transport';
import type { Logger } from '../../lib/logger';
import { pollUntilComplete } from '../../lib/poller';
import {
    TemplateInfo,
    TemplateWithBuilds,
    TemplateBuildInfo,
    TemplateBuildLogs,
    CreateTemplateParams,
    UpdateTemplateParams,
    ListTemplatesParams,
    WaitForBuildOptions,
    RawTemplateInfo,
    RawTemplateBuildInfo,
    RawTemplateBuildLogEntry,
    normalizeTemplateInfo,
    normalizeTemplateBuildInfo,
} from './types';

/** Raw template create response from API */
interface RawTemplateCreateResponse {
    templateID: string;
    buildID: string;
}

/** Template create response */
export interface TemplateCreateResponse {
    templateId: string;
    buildId: string;
}

/** Raw template with builds from API */
interface RawTemplateWithBuilds {
    templateID: string;
    name: string;
    aliases?: string[];
    public: boolean;
    buildDescription: string;
    cpuCount: number;
    memoryMB: number;
    diskSizeMB: number;
    createdAt: string;
    updatedAt: string;
    builds?: RawTemplateBuildInfo[];
}

/**
 * Template management — create, list, get, update, delete templates.
 */
export class Templates {
    private transport: ChildTransport;
    private logger: Logger;

    constructor(transport: ChildTransport, logger: Logger) {
        this.transport = transport;
        this.logger = logger;
    }

    /**
     * List all templates.
     */
    async list(params?: ListTemplatesParams): Promise<TemplateInfo[]> {
        this.logger.debug('Listing templates', params as Record<string, unknown>);
        const queryParams: Record<string, string> = {};
        if (params?.teamId) {
            queryParams.teamID = params.teamId;
        }
        const raw = await this.transport.get<RawTemplateInfo[]>('/templates', queryParams);
        return (raw || []).map(normalizeTemplateInfo);
    }

    /**
     * Create a new template. Returns the template ID and build ID.
     * Use waitForBuild() to wait for the build to complete.
     */
    async create(params: CreateTemplateParams): Promise<TemplateCreateResponse> {
        this.logger.info('Creating template', { name: params.name });

        const body = {
            dockerfile: params.dockerfile,
            name: params.name,
            cpuCount: params.cpuCount,
            memoryMB: params.memoryMB,
            diskSizeMB: params.diskSizeMB,
            startCmd: params.startCmd,
        };

        const raw = await this.transport.post<RawTemplateCreateResponse>('/templates', body);
        return {
            templateId: raw.templateID,
            buildId: raw.buildID,
        };
    }

    /**
     * Get template details with build history.
     */
    async get(templateId: string): Promise<TemplateWithBuilds> {
        this.logger.debug('Getting template', { templateId });
        const raw = await this.transport.get<RawTemplateWithBuilds>(`/templates/${templateId}`);
        return {
            template: normalizeTemplateInfo(raw as unknown as RawTemplateInfo),
            builds: (raw.builds || []).map(normalizeTemplateBuildInfo),
        };
    }

    /**
     * Delete a template.
     */
    async delete(templateId: string): Promise<void> {
        this.logger.info('Deleting template', { templateId });
        await this.transport.delete(`/templates/${templateId}`);
    }

    /**
     * Update a template.
     */
    async update(templateId: string, params: UpdateTemplateParams): Promise<void> {
        this.logger.info('Updating template', { templateId, params });
        await this.transport.post(`/templates/${templateId}`, params);
    }

    /**
     * Get the build status of a template build.
     */
    async getBuildStatus(templateId: string, buildId: string): Promise<TemplateBuildInfo> {
        const raw = await this.transport.get<RawTemplateBuildInfo>(
            `/templates/${templateId}/builds/${buildId}`
        );
        return normalizeTemplateBuildInfo(raw);
    }

    /**
     * Get the build logs of a template build.
     */
    async getBuildLogs(templateId: string, buildId: string): Promise<TemplateBuildLogs> {
        const raw = await this.transport.get<{ logs: RawTemplateBuildLogEntry[] }>(
            `/templates/${templateId}/builds/${buildId}/logs`
        );
        return {
            logs: (raw.logs || []).map(l => ({
                line: l.line,
                timestamp: l.timestamp,
            })),
        };
    }

    /**
     * Wait for a template build to complete (ready or error).
     * Polls getBuildStatus at the specified interval.
     */
    async waitForBuild(
        templateId: string,
        buildId: string,
        opts?: WaitForBuildOptions
    ): Promise<TemplateBuildInfo> {
        const timeoutMs = opts?.timeoutMs ?? 120_000;
        const intervalMs = opts?.intervalMs ?? 2_000;

        this.logger.debug('Waiting for template build', { templateId, buildId, timeoutMs });

        const pollResult = await pollUntilComplete(`${templateId}/${buildId}`, {
            intervalMs,
            timeoutMs,
            isTerminal: (info: TemplateBuildInfo) =>
                info.status === 'ready' || info.status === 'error',
            getStatus: async () => this.getBuildStatus(templateId, buildId),
            logger: this.logger,
        });
        return pollResult.result;
    }
}
