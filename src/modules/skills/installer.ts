/**
 * SkillInstaller — validates downloaded skill packages against manifest v2.
 *
 * Performs file-level SHA256 integrity verification during installation.
 * Delegates shared security checks to SkillValidator.
 *
 * @module
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillValidator, DEFAULT_CONTENT_EXTENSIONS, DEFAULT_ACTION_EXTENSIONS } from './validator';

export interface SkillInstallerOptions {
    /**
     * Whether to allow action file extensions (.ts, .js, .mjs, .sh).
     * Default: false — only content extensions (.md, .txt, .json) are allowed.
     *
     * Set to true ONLY for trusted local skills or after explicit user consent.
     * Remote skill installs should default to false for security.
     *
     * @default false
     */
    allowActions?: boolean;
}

export interface InstallerValidationResult {
    valid: boolean;
    errors: string[];
}

interface ManifestV2Files {
    [filePath: string]: { sha256: string; size: number };
}

// ============================================================================
// SkillInstaller
// ============================================================================

export class SkillInstaller {
    private validator: SkillValidator;
    private readonly allowActions: boolean;

    constructor(options?: SkillInstallerOptions) {
        this.validator = new SkillValidator();
        this.allowActions = options?.allowActions ?? false;
    }

    /**
     * Validate a downloaded skill package against its manifest.
     * Checks: file existence, size, SHA256 integrity.
     */
    async validate(
        skillDir: string,
        manifest: { files?: ManifestV2Files },
    ): Promise<InstallerValidationResult> {
        const errors: string[] = [];

        if (!manifest.files) {
            return { valid: false, errors: ['Manifest has no files field (not v2)'] };
        }

        for (const [filePath, expected] of Object.entries(manifest.files)) {
            const fullPath = path.resolve(skillDir, filePath);

            // Security: reject path traversal (e.g., ../outside.sh)
            if (!this.validator.isWithinRoot(fullPath, skillDir)) {
                errors.push(`Path traversal blocked: "${filePath}" resolves outside skill root`);
                continue;
            }

            // Security: enforce extension whitelist
            // Default: content-only (.md, .txt, .json); action extensions (.ts, .js, .mjs, .sh) require allowActions=true
            const allowedExtensions = this.allowActions
                ? [...DEFAULT_CONTENT_EXTENSIONS, ...DEFAULT_ACTION_EXTENSIONS]
                : [...DEFAULT_CONTENT_EXTENSIONS];
            if (!this.validator.isAllowedExtension(filePath, allowedExtensions)) {
                const ext = path.extname(filePath).toLowerCase();
                errors.push(`Blocked extension: "${filePath}" (extension "${ext}" not in whitelist)`);
                continue;
            }

            // Check existence
            if (!fs.existsSync(fullPath)) {
                errors.push(`Missing file: ${filePath}`);
                continue;
            }

            // Check size
            const stat = fs.statSync(fullPath);
            if (stat.size !== expected.size) {
                errors.push(`File "${filePath}" size mismatch: expected ${expected.size}, got ${stat.size}`);
                continue;
            }

            // Check SHA256
            if (!this.validator.verifyIntegrity(fullPath, expected.sha256)) {
                errors.push(`File "${filePath}" SHA256 mismatch (tampered or corrupted)`);
            }
        }

        return { valid: errors.length === 0, errors };
    }
}
