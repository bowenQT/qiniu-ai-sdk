import * as fs from 'fs';
import * as path from 'path';

export const STARTER_TEMPLATES = ['chat', 'agent', 'node-agent'] as const;

export type StarterTemplate = typeof STARTER_TEMPLATES[number];

export interface InitCommandOptions {
    template: StarterTemplate;
    targetDir: string;
    projectName?: string;
    packageRoot: string;
}

export interface InitCommandResult {
    targetDir: string;
    template: StarterTemplate;
    files: string[];
}

function isStarterTemplate(template: string): template is StarterTemplate {
    return (STARTER_TEMPLATES as readonly string[]).includes(template);
}

export function parseStarterTemplate(value: string | undefined): StarterTemplate {
    if (!value || !isStarterTemplate(value)) {
        throw new Error(
            `Invalid template "${value ?? ''}". Use one of: ${STARTER_TEMPLATES.join(', ')}`,
        );
    }
    return value;
}

export function getStarterTemplateDir(packageRoot: string, template: StarterTemplate): string {
    return path.join(packageRoot, 'templates', 'starters', template);
}

function ensureEmptyDirectory(targetDir: string): void {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        return;
    }

    const entries = fs.readdirSync(targetDir).filter((entry) => entry !== '.DS_Store');
    if (entries.length > 0) {
        throw new Error(`Target directory is not empty: ${targetDir}`);
    }
}

function listFilesRecursive(rootDir: string): string[] {
    const output: string[] = [];

    function walk(currentDir: string): void {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const absolute = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(absolute);
                continue;
            }
            output.push(path.relative(rootDir, absolute).replace(/\\/g, '/'));
        }
    }

    walk(rootDir);
    return output.sort();
}

function replaceTemplateVariables(targetDir: string, projectName: string): void {
    for (const relativePath of listFilesRecursive(targetDir)) {
        const absolutePath = path.join(targetDir, relativePath);
        const content = fs.readFileSync(absolutePath, 'utf8');
        fs.writeFileSync(
            absolutePath,
            content.replace(/\{\{PROJECT_NAME\}\}/g, projectName),
            'utf8',
        );
    }
}

function normalizeProjectName(projectName: string): string {
    const normalized = projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'qiniu-ai-app';
}

export function initStarterProject(options: InitCommandOptions): InitCommandResult {
    const templateDir = getStarterTemplateDir(options.packageRoot, options.template);
    if (!fs.existsSync(templateDir)) {
        throw new Error(`Starter template not found: ${options.template}`);
    }

    const targetDir = path.resolve(options.targetDir);
    ensureEmptyDirectory(targetDir);

    fs.cpSync(templateDir, targetDir, { recursive: true });
    const projectName = normalizeProjectName(
        options.projectName || path.basename(targetDir) || options.template,
    );
    replaceTemplateVariables(targetDir, projectName);

    return {
        targetDir,
        template: options.template,
        files: listFilesRecursive(targetDir),
    };
}
