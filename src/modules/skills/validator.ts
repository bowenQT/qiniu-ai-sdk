/**
 * SkillValidator — shared security primitives for skill loading and installation.
 *
 * Extracted from SkillLoader to be reusable by SkillInstaller (remote download validation).
 *
 * @module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Constants — Dual Whitelist
// ============================================================================

/** Default extensions for content files (instructions, references) */
export const DEFAULT_CONTENT_EXTENSIONS = ['.md', '.txt', '.json'];

/** Default extensions for action scripts */
export const DEFAULT_ACTION_EXTENSIONS = ['.ts', '.js', '.mjs', '.sh'];
// ============================================================================

export class SkillValidator {
    /**
     * Safe boundary check for path containment.
     * Uses path.resolve to avoid prefix bypass attacks.
     */
    isWithinRoot(targetPath: string, rootDir: string): boolean {
        const normalizedRoot = path.resolve(rootDir) + path.sep;
        const normalizedTarget = path.resolve(targetPath);

        if (normalizedTarget === path.resolve(rootDir)) {
            return true;
        }

        return normalizedTarget.startsWith(normalizedRoot);
    }

    /**
     * Check if a file has an allowed extension (case-insensitive).
     */
    isAllowedExtension(filePath: string, whitelist: string[]): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return whitelist.some(allowed => allowed.toLowerCase() === ext);
    }

    /**
     * Check file size against a limit. Throws if exceeds.
     */
    checkFileSize(filePath: string, maxBytes: number): void {
        const stat = fs.statSync(filePath);
        if (stat.size > maxBytes) {
            throw new Error(
                `File "${path.basename(filePath)}" size ${stat.size} exceeds limit ${maxBytes} bytes`
            );
        }
    }

    /**
     * Verify file SHA256 against expected hash.
     */
    verifyIntegrity(filePath: string, expectedHash: string): boolean {
        const content = fs.readFileSync(filePath);
        const actual = crypto.createHash('sha256').update(content).digest('hex');
        return actual === expectedHash;
    }
}
