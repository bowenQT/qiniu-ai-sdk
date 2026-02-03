/**
 * Skill Registry with remote discovery and security validation.
 * 
 * Implements the Skill Marketplace Protocol with:
 * - Local and remote skill registration
 * - SHA256 integrity verification
 * - Domain allowlist security
 * - TTL-based caching
 * 
 * @module
 */

import * as crypto from 'crypto';
import { RecoverableError } from '../../lib/errors';
import { parseManifest, parseManifestStrict, checkCompatibility, type SkillManifest } from './manifest';
import { SkillLoader, SkillNotFoundError } from './loader';
import type { Skill } from './types';

// ============================================================================
// Types
// ============================================================================

/** Registry configuration */
export interface SkillRegistryConfig {
    /** Local skills directory */
    skillsDir?: string;
    /** Allow remote skill loading (default: false) */
    allowRemote?: boolean;
    /** Trusted domain allowlist (when allowRemote=true) */
    allowedDomains?: string[];
    /** Remote fetch timeout in ms (default: 5000) */
    remoteTimeout?: number;
    /** Verify SHA256 integrity (default: true) */
    verifyIntegrity?: boolean;
    /** Cache configuration */
    cache?: {
        enabled: boolean;
        ttlSeconds: number;
    };
    /** Current SDK version for compatibility checks */
    sdkVersion?: string;
}

/** Remote skill source */
export interface RemoteSkillSource {
    /** URL to skill.json manifest */
    url: string;
    /** SHA256 hash of skill.json content for integrity verification */
    integrityHash?: string;
    /** Authorization header for private repos */
    authorization?: string;
}

/** Registered skill entry */
export interface RegisteredSkill {
    manifest: SkillManifest;
    source: 'local' | 'remote';
    /** For remote skills */
    remoteUrl?: string;
    /** Loaded skill content */
    skill?: Skill;
    /** Last fetch timestamp */
    fetchedAt?: Date;
    /** Integrity hash at fetch time */
    integrityHash?: string;
}

/** Search result */
export interface SkillSearchResult {
    name: string;
    description: string;
    version: string;
    tags: string[];
    source: 'local' | 'remote';
    score: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<SkillRegistryConfig> = {
    skillsDir: '',
    allowRemote: false,
    allowedDomains: [],
    remoteTimeout: 5000,
    verifyIntegrity: true,
    cache: { enabled: true, ttlSeconds: 3600 },
    sdkVersion: '0.32.0',
};

// ============================================================================
// SkillRegistry Class
// ============================================================================

/**
 * Skill Registry for discovering, registering, and loading skills.
 * 
 * @example
 * ```typescript
 * const registry = new SkillRegistry({
 *     skillsDir: './.agent/skills',
 *     allowRemote: true,
 *     allowedDomains: ['skills.example.com'],
 * });
 * 
 * // Register local skills
 * await registry.discoverLocal();
 * 
 * // Register remote skill
 * await registry.registerRemote({
 *     url: 'https://skills.example.com/git-workflow/skill.json',
 *     integrityHash: 'sha256:abc123...',
 * });
 * 
 * // Search
 * const results = registry.search('git');
 * ```
 */
export class SkillRegistry {
    private readonly config: Required<SkillRegistryConfig>;
    private readonly skills = new Map<string, RegisteredSkill>();
    private loader?: SkillLoader;

    constructor(config: SkillRegistryConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        if (this.config.skillsDir) {
            try {
                this.loader = new SkillLoader({ skillsDir: this.config.skillsDir });
            } catch {
                // Skills directory doesn't exist, loader unavailable
            }
        }
    }

    // ========================================================================
    // Registration Methods
    // ========================================================================

    /**
     * Discover and register all local skills.
     * 
     * @returns Number of skills registered
     */
    async discoverLocal(): Promise<number> {
        if (!this.loader) {
            return 0;
        }

        const skills = await this.loader.loadAll();
        let count = 0;

        for (const skill of skills) {
            // Try to load manifest if exists
            const manifest = await this.tryLoadLocalManifest(skill.name);

            if (manifest) {
                // Check compatibility
                const compat = checkCompatibility(manifest, this.config.sdkVersion);
                if (!compat.compatible) {
                    console.warn(`Skill "${skill.name}" incompatible: ${compat.reason}`);
                    continue;
                }
            }

            this.skills.set(skill.name, {
                manifest: manifest ?? this.createDefaultManifest(skill),
                source: 'local',
                skill,
                fetchedAt: new Date(),
            });
            count++;
        }

        return count;
    }

    /**
     * Register a remote skill.
     * 
     * @param source - Remote skill source with URL and optional integrity hash
     * @throws RecoverableError if remote loading is disabled or verification fails
     */
    async registerRemote(source: RemoteSkillSource): Promise<void> {
        if (!this.config.allowRemote) {
            throw new RecoverableError(
                'Remote skill loading is disabled. Set allowRemote: true to enable.',
                'skill-registry',
                'Enable allowRemote in SkillRegistryConfig'
            );
        }

        // Validate domain
        const url = new URL(source.url);
        if (!this.isAllowedDomain(url.hostname)) {
            throw new RecoverableError(
                `Domain "${url.hostname}" is not in the allowlist`,
                'skill-registry',
                'Add the domain to allowedDomains in config'
            );
        }

        // Fetch manifest
        const content = await this.fetchWithTimeout(source.url, source.authorization);

        // Verify integrity
        if (this.config.verifyIntegrity && source.integrityHash) {
            const hash = this.computeHash(content);
            if (hash !== source.integrityHash) {
                throw new RecoverableError(
                    `Integrity verification failed for ${source.url}. Expected: ${source.integrityHash}, Got: ${hash}`,
                    'skill-registry',
                    'Update integrityHash with the correct SHA256 hash'
                );
            }
        }

        // Parse manifest
        const manifest = parseManifestStrict(content);

        // Check compatibility
        const compat = checkCompatibility(manifest, this.config.sdkVersion);
        if (!compat.compatible) {
            throw new RecoverableError(
                `Skill "${manifest.name}" is not compatible: ${compat.reason}`,
                'skill-registry',
                'Update SDK version or find a compatible skill version'
            );
        }

        this.skills.set(manifest.name, {
            manifest,
            source: 'remote',
            remoteUrl: source.url,
            fetchedAt: new Date(),
            integrityHash: source.integrityHash,
        });
    }

    /**
     * Refresh a remote skill with a new integrity hash.
     * 
     * @param name - Skill name
     * @param newHash - New SHA256 hash for verification
     */
    async refreshSkill(name: string, newHash: string): Promise<void> {
        const existing = this.skills.get(name);
        if (!existing || existing.source !== 'remote' || !existing.remoteUrl) {
            throw new RecoverableError(
                `Remote skill "${name}" not found`,
                'skill-registry',
                'Register the remote skill first using registerRemote()'
            );
        }

        await this.registerRemote({
            url: existing.remoteUrl,
            integrityHash: newHash,
        });
    }

    /**
     * Unregister a skill.
     */
    unregister(name: string): boolean {
        return this.skills.delete(name);
    }

    // ========================================================================
    // Query Methods
    // ========================================================================

    /**
     * Get a registered skill by name.
     */
    get(name: string): RegisteredSkill | undefined {
        return this.skills.get(name);
    }

    /**
     * Check if a skill is registered.
     */
    has(name: string): boolean {
        return this.skills.has(name);
    }

    /**
     * Get all registered skill names.
     */
    list(): string[] {
        return Array.from(this.skills.keys()).sort();
    }

    /**
     * Search skills by query (fuzzy match on name, description, tags).
     */
    search(query: string): SkillSearchResult[] {
        const results: SkillSearchResult[] = [];
        const lowerQuery = query.toLowerCase();

        for (const [name, entry] of this.skills) {
            let score = 0;
            const manifest = entry.manifest;

            // Name match (highest weight)
            if (name.toLowerCase().includes(lowerQuery)) {
                score += 100;
                if (name.toLowerCase() === lowerQuery) score += 50;
            }

            // Tag match
            const tags = manifest.tags ?? [];
            for (const tag of tags) {
                if (tag.toLowerCase().includes(lowerQuery)) {
                    score += 50;
                }
            }

            // Description match
            if (manifest.description.toLowerCase().includes(lowerQuery)) {
                score += 25;
            }

            if (score > 0) {
                results.push({
                    name,
                    description: manifest.description,
                    version: manifest.version,
                    tags,
                    source: entry.source,
                    score,
                });
            }
        }

        // Sort by score descending
        return results.sort((a, b) => b.score - a.score);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private async tryLoadLocalManifest(skillName: string): Promise<SkillManifest | null> {
        if (!this.loader) return null;

        try {
            const fs = await import('fs');
            const path = await import('path');
            const manifestPath = path.join(this.config.skillsDir, skillName, 'skill.json');

            if (fs.existsSync(manifestPath)) {
                const content = fs.readFileSync(manifestPath, 'utf-8');
                const result = parseManifest(content);
                return result.valid ? result.manifest! : null;
            }
        } catch {
            // Ignore errors
        }
        return null;
    }

    private createDefaultManifest(skill: Skill): SkillManifest {
        return {
            name: skill.name,
            version: '0.0.0',
            description: `Local skill: ${skill.name}`,
            entry: 'SKILL.md',
            entryType: 'markdown',
        };
    }

    private isAllowedDomain(hostname: string): boolean {
        if (this.config.allowedDomains.length === 0) {
            return true; // No allowlist = allow all (if allowRemote is true)
        }
        return this.config.allowedDomains.some(domain => {
            if (domain.startsWith('*.')) {
                const suffix = domain.slice(1); // ".example.com"
                return hostname.endsWith(suffix) || hostname === domain.slice(2);
            }
            return hostname === domain;
        });
    }

    private async fetchWithTimeout(url: string, authorization?: string): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.remoteTimeout);

        try {
            const headers: Record<string, string> = {};
            if (authorization) {
                headers['Authorization'] = authorization;
            }

            const response = await fetch(url, {
                signal: controller.signal,
                headers,
            });

            if (!response.ok) {
                throw new RecoverableError(
                    `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
                    'skill-registry',
                    'Check the URL and network connectivity'
                );
            }

            return await response.text();
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new RecoverableError(
                    `Timeout fetching ${url} (${this.config.remoteTimeout}ms)`,
                    'skill-registry',
                    'Increase remoteTimeout or check network connectivity'
                );
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    private computeHash(content: string): string {
        const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
        return `sha256:${hash}`;
    }
}
