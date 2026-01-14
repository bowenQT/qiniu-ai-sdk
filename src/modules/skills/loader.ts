/**
 * Skill Loader with security-first file validation.
 * - Only relative paths allowed
 * - realpath + root check for each reference
 * - Size limits enforced
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Skill, SkillLoaderConfig, SkillReference } from './types';
import { DEFAULT_SKILL_CONFIG } from './types';

/** Security error for path/file violations */
export class SkillSecurityError extends Error {
    constructor(message: string, public readonly path?: string) {
        super(message);
        this.name = 'SkillSecurityError';
    }
}

/** Skill not found error */
export class SkillNotFoundError extends Error {
    constructor(skillName: string) {
        super(`Skill not found: ${skillName}`);
        this.name = 'SkillNotFoundError';
    }
}

/**
 * Skill Loader loads and validates skill files.
 */
export class SkillLoader {
    private readonly config: Required<SkillLoaderConfig>;
    private readonly resolvedSkillsDir: string;

    constructor(config: SkillLoaderConfig) {
        this.config = {
            skillsDir: config.skillsDir,
            allowedExtensions: config.allowedExtensions ?? DEFAULT_SKILL_CONFIG.allowedExtensions,
            maxFileSize: config.maxFileSize ?? DEFAULT_SKILL_CONFIG.maxFileSize,
            maxReferenceDepth: config.maxReferenceDepth ?? DEFAULT_SKILL_CONFIG.maxReferenceDepth,
        };

        // Resolve and validate skills directory
        if (!fs.existsSync(config.skillsDir)) {
            throw new SkillSecurityError(`Skills directory not found: ${config.skillsDir}`);
        }
        this.resolvedSkillsDir = fs.realpathSync(config.skillsDir);
    }

    /**
     * Load a skill by name.
     */
    async load(skillName: string): Promise<Skill> {
        // Validate skill name (no path separators)
        if (skillName.includes('/') || skillName.includes('\\') || skillName.includes('..')) {
            throw new SkillSecurityError('Invalid skill name: path separators not allowed', skillName);
        }

        const skillDir = path.join(this.resolvedSkillsDir, skillName);

        // Check skill directory exists
        if (!fs.existsSync(skillDir)) {
            throw new SkillNotFoundError(skillName);
        }

        // Validate skill directory is within root using safe boundary check
        const resolvedSkillDir = fs.realpathSync(skillDir);
        if (!this.isWithinRoot(resolvedSkillDir, this.resolvedSkillsDir)) {
            throw new SkillSecurityError('Skill directory escape detected', skillName);
        }

        // Load SKILL.md
        const skillMdPath = path.join(resolvedSkillDir, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) {
            throw new SkillNotFoundError(`${skillName}/SKILL.md`);
        }

        const content = await this.readFileSecure(skillMdPath, resolvedSkillDir);

        // Parse and load references
        const references = await this.loadReferences(content, resolvedSkillDir, 0);

        // Estimate token count
        const totalContent = content + references.map(r => r.content).join('\n');
        const tokenCount = this.estimateTokens(totalContent);

        return {
            name: skillName,
            content,
            references,
            tokenCount,
        };
    }

    /**
     * Load all skills from the skills directory.
     */
    async loadAll(): Promise<Skill[]> {
        const entries = fs.readdirSync(this.resolvedSkillsDir, { withFileTypes: true });
        const skills: Skill[] = [];

        // Sort for deterministic order
        const dirs = entries
            .filter(e => e.isDirectory())
            .map(e => e.name)
            .sort();

        for (const dir of dirs) {
            try {
                const skill = await this.load(dir);
                skills.push(skill);
            } catch (e) {
                // Skip invalid skills
                if (e instanceof SkillNotFoundError) {
                    continue;
                }
                throw e;
            }
        }

        return skills;
    }

    /**
     * Read a file with security validation.
     */
    private async readFileSecure(filePath: string, rootDir: string): Promise<string> {
        // Resolve real path
        let resolvedPath: string;
        try {
            resolvedPath = fs.realpathSync(filePath);
        } catch {
            throw new SkillSecurityError(`File not found: ${filePath}`, filePath);
        }

        // Root check using safe boundary
        if (!this.isWithinRoot(resolvedPath, rootDir)) {
            throw new SkillSecurityError('Path escape detected', filePath);
        }

        // Extension check
        const ext = path.extname(resolvedPath).toLowerCase();
        if (!this.config.allowedExtensions.includes(ext)) {
            throw new SkillSecurityError(`Extension not allowed: ${ext}`, filePath);
        }

        // Size check
        const stat = fs.statSync(resolvedPath);
        if (stat.size > this.config.maxFileSize) {
            throw new SkillSecurityError(
                `File exceeds size limit: ${stat.size} > ${this.config.maxFileSize}`,
                filePath
            );
        }

        return fs.readFileSync(resolvedPath, 'utf-8');
    }

    /**
     * Parse and load references from content.
     * Only relative paths are allowed.
     */
    private async loadReferences(
        content: string,
        rootDir: string,
        depth: number
    ): Promise<SkillReference[]> {
        if (depth >= this.config.maxReferenceDepth) {
            return [];
        }

        const references: SkillReference[] = [];

        // Match markdown-style references: [text](path)
        const refPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;

        while ((match = refPattern.exec(content)) !== null) {
            const refPath = match[2];

            // Skip URLs
            if (refPath.startsWith('http://') || refPath.startsWith('https://')) {
                continue;
            }

            // Only allow relative paths
            if (path.isAbsolute(refPath)) {
                throw new SkillSecurityError('Absolute paths not allowed in references', refPath);
            }

            // Skip if not an allowed extension
            const ext = path.extname(refPath).toLowerCase();
            if (!this.config.allowedExtensions.includes(ext)) {
                continue;
            }

            const fullPath = path.join(rootDir, refPath);

            try {
                const refContent = await this.readFileSecure(fullPath, rootDir);
                references.push({
                    path: refPath,
                    content: refContent,
                });
            } catch {
                // Skip invalid references
                continue;
            }
        }

        return references;
    }

    /**
     * Estimate token count with CJK multiplier.
     */
    private estimateTokens(text: string): number {
        // Count CJK characters
        const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
        const cjkMatches = text.match(cjkPattern);
        const cjkCount = cjkMatches?.length ?? 0;

        // CJK ratio
        const cjkRatio = cjkCount / text.length;

        // Base estimate: ~4 chars per token
        const baseTokens = Math.ceil(text.length / 4);

        // Apply CJK multiplier if significant CJK content (>20%)
        if (cjkRatio > 0.2) {
            return Math.ceil(baseTokens * 1.5);
        }

        return baseTokens;
    }

    /**
     * Safe boundary check for path containment.
     * Uses path.relative to avoid prefix bypass attacks.
     */
    private isWithinRoot(targetPath: string, rootDir: string): boolean {
        // Ensure both paths are normalized and absolute
        const normalizedRoot = path.resolve(rootDir) + path.sep;
        const normalizedTarget = path.resolve(targetPath);

        // Check if target starts with root + separator
        // This prevents /root-malicious from matching /root
        if (normalizedTarget === path.resolve(rootDir)) {
            return true;
        }

        // Use startsWith with separator boundary
        return normalizedTarget.startsWith(normalizedRoot);
    }
}
