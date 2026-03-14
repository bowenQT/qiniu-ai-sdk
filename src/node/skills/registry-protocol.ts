/**
 * Registry Protocol v2 — Interface reservation.
 *
 * These interfaces define the future registry protocol for server-side
 * skill discovery and distribution. Implementation depends on server-side
 * availability.
 *
 * @module
 */

// ============================================================================
// Types (Reserved — not yet implemented)
// ============================================================================

/** Registry search result entry */
export interface RegistrySkillEntry {
    /** Skill name (unique within registry) */
    name: string;
    /** Latest version */
    version: string;
    /** Human-readable description */
    description: string;
    /** Discovery tags */
    tags: string[];
    /** Author name */
    author?: string;
    /** Download count */
    downloads?: number;
    /** Manifest URL */
    manifestUrl: string;
    /** SHA256 integrity hash of the manifest */
    integrityHash: string;
}

/** Registry search options */
export interface RegistrySearchOptions {
    /** Search query */
    query: string;
    /** Maximum results */
    limit?: number;
    /** Tags filter */
    tags?: string[];
    /** Sort by */
    sort?: 'relevance' | 'downloads' | 'updated';
}

/** Registry Protocol v2 interface */
export interface SkillRegistryProtocol {
    /** Search the registry for skills */
    search(options: RegistrySearchOptions): Promise<RegistrySkillEntry[]>;
    /** Get a specific skill by name */
    resolve(name: string, version?: string): Promise<RegistrySkillEntry | null>;
    /** Publish a skill to the registry */
    publish?(manifest: unknown, files: Map<string, Buffer>): Promise<void>;
}

/**
 * Stub implementation — returns empty results.
 * Replace with real implementation when server-side registry is available.
 */
export class RegistryProtocolStub implements SkillRegistryProtocol {
    async search(_options: RegistrySearchOptions): Promise<RegistrySkillEntry[]> {
        return [];
    }

    async resolve(_name: string, _version?: string): Promise<RegistrySkillEntry | null> {
        return null;
    }
}
