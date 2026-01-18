/**
 * Memory Manager for Agent conversations.
 * Provides short-term and long-term memory management with automatic summarization.
 * 
 * @example
 * ```typescript
 * import { MemoryManager, InMemoryVectorStore } from '@bowenqt/qiniu-ai-sdk';
 * 
 * const memory = new MemoryManager({
 *     shortTerm: { maxMessages: 20 },
 *     summarizer: {
 *         enabled: true,
 *         threshold: 50,
 *         client,
 *         model: 'gemini-2.5-flash',
 *     },
 * });
 * 
 * // Apply memory to messages before sending to LLM
 * const processedMessages = await memory.process(messages, options);
 * ```
 */

import type { ChatMessage } from '../../lib/types';
import type { InternalMessage, MessageMeta } from '../internal-types';

// ============================================================================
// Types
// ============================================================================

/** Short-term memory configuration */
export interface ShortTermMemoryConfig {
    /** Maximum number of recent messages to keep */
    maxMessages?: number;
}

/** Summarizer configuration */
export interface SummarizerConfig {
    /** Enable automatic summarization */
    enabled: boolean;
    /** Message count threshold to trigger summarization */
    threshold?: number;
    /** System prompt for summarization */
    systemPrompt?: string;
}

/** Vector store interface for long-term memory */
export interface VectorStore {
    /** Add documents to the store */
    add(documents: VectorDocument[]): Promise<void>;
    /** Search for similar documents */
    search(query: string, limit?: number): Promise<VectorDocument[]>;
    /** Clear all documents */
    clear(): Promise<void>;
}

/** Document for vector storage */
export interface VectorDocument {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    embedding?: number[];
}

/** Long-term memory configuration */
export interface LongTermMemoryConfig {
    /** Vector store implementation */
    store: VectorStore;
    /** Number of documents to retrieve */
    retrieveLimit?: number;
}

/** Memory manager configuration */
export interface MemoryConfig {
    /** Short-term memory (sliding window) */
    shortTerm?: ShortTermMemoryConfig;
    /** Long-term memory (vector store) */
    longTerm?: LongTermMemoryConfig;
    /** Automatic summarization */
    summarizer?: SummarizerConfig;
}

/** Memory processing options */
export interface MemoryProcessOptions {
    /** Thread ID for memory isolation */
    threadId?: string;
    /** Whether to generate summary if threshold exceeded */
    generateSummary?: boolean;
}

/** Memory processing result */
export interface MemoryProcessResult {
    /** Processed messages ready for LLM */
    messages: InternalMessage[];
    /** Whether summarization was triggered */
    summarized: boolean;
    /** Generated summary (if any) */
    summary?: string;
    /** Number of messages dropped */
    droppedCount: number;
}

/** Summary message metadata */
export interface SummaryMeta extends MessageMeta {
    summaryId: string;
    droppable: true;
}

// ============================================================================
// In-Memory Vector Store (Simple Implementation)
// ============================================================================

/**
 * Simple in-memory vector store for testing and small-scale use.
 * Uses cosine similarity for search (requires embeddings).
 */
export class InMemoryVectorStore implements VectorStore {
    private documents: VectorDocument[] = [];

    async add(documents: VectorDocument[]): Promise<void> {
        this.documents.push(...documents);
    }

    async search(query: string, limit = 5): Promise<VectorDocument[]> {
        // Simple text search (no embeddings)
        // In production, use proper embeddings and vector similarity
        const queryLower = query.toLowerCase();
        const scored = this.documents.map(doc => ({
            doc,
            score: this.textSimilarity(queryLower, doc.content.toLowerCase()),
        }));

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.doc);
    }

    async clear(): Promise<void> {
        this.documents = [];
    }

    private textSimilarity(a: string, b: string): number {
        // Simple word overlap score
        const wordsA = new Set(a.split(/\s+/));
        const wordsB = new Set(b.split(/\s+/));
        let overlap = 0;
        for (const word of wordsA) {
            if (wordsB.has(word)) overlap++;
        }
        return overlap / Math.max(wordsA.size, wordsB.size, 1);
    }
}

// ============================================================================
// Memory Manager
// ============================================================================

/**
 * Memory manager for agent conversations.
 * Handles short-term (sliding window) and long-term (vector) memory.
 */
export class MemoryManager {
    private config: MemoryConfig;
    private summaries: Map<string, string> = new Map(); // threadId -> summary

    constructor(config: MemoryConfig = {}) {
        this.config = {
            shortTerm: { maxMessages: 50, ...config.shortTerm },
            ...config,
        };
    }

    /**
     * Process messages with memory management.
     * Applies summarization, trimming, and long-term retrieval.
     */
    async process(
        messages: InternalMessage[],
        options: MemoryProcessOptions = {}
    ): Promise<MemoryProcessResult> {
        const { threadId = 'default', generateSummary = true } = options;
        let processedMessages = [...messages];
        let summarized = false;
        let summary: string | undefined;
        let droppedCount = 0;

        // 1. Check if summarization is needed
        const threshold = this.config.summarizer?.threshold ?? 50;
        if (
            this.config.summarizer?.enabled &&
            generateSummary &&
            messages.length > threshold
        ) {
            // Generate summary from older messages
            const messagesToSummarize = messages.slice(0, messages.length - Math.floor(threshold / 2));
            summary = await this.generateSummary(messagesToSummarize, threadId);
            this.summaries.set(threadId, summary);
            summarized = true;
        }

        // 2. Apply short-term memory (sliding window)
        const maxMessages = this.config.shortTerm?.maxMessages ?? 50;
        if (processedMessages.length > maxMessages) {
            droppedCount = processedMessages.length - maxMessages;
            processedMessages = processedMessages.slice(-maxMessages);
        }

        // 3. Inject summary if available
        const existingSummary = this.summaries.get(threadId);
        if (existingSummary) {
            const summaryMessage: InternalMessage = {
                role: 'system',
                content: `[CONVERSATION SUMMARY]\n${existingSummary}`,
                _meta: {
                    summaryId: `summary_${threadId}`,
                    droppable: true,
                    priority: 100, // Low priority (drop first)
                },
            };

            // Insert after first system message
            const firstSystemIdx = processedMessages.findIndex(m => m.role === 'system');
            if (firstSystemIdx >= 0) {
                processedMessages.splice(firstSystemIdx + 1, 0, summaryMessage);
            } else {
                processedMessages.unshift(summaryMessage);
            }
        }

        // 4. Long-term retrieval (if configured)
        if (this.config.longTerm) {
            const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
            if (lastUserMessage && typeof lastUserMessage.content === 'string') {
                const retrieved = await this.config.longTerm.store.search(
                    lastUserMessage.content,
                    this.config.longTerm.retrieveLimit ?? 3
                );

                if (retrieved.length > 0) {
                    const contextMessage: InternalMessage = {
                        role: 'system',
                        content: `[RELEVANT CONTEXT]\n${retrieved.map(d => d.content).join('\n---\n')}`,
                        _meta: {
                            summaryId: `context_${threadId}`,
                            droppable: true,
                            priority: 90,
                        },
                    };

                    // Insert after summary (or first system)
                    const insertIdx = processedMessages.findIndex(
                        m => m._meta?.summaryId?.startsWith('summary_')
                    );
                    if (insertIdx >= 0) {
                        processedMessages.splice(insertIdx + 1, 0, contextMessage);
                    } else {
                        const firstSystemIdx = processedMessages.findIndex(m => m.role === 'system');
                        processedMessages.splice(firstSystemIdx + 1, 0, contextMessage);
                    }
                }
            }
        }

        return {
            messages: processedMessages,
            summarized,
            summary,
            droppedCount,
        };
    }

    /**
     * Generate summary from messages.
     * Override this method for custom summarization logic.
     */
    protected async generateSummary(
        messages: InternalMessage[],
        _threadId: string
    ): Promise<string> {
        // Default: Simple concatenation (override for LLM-based summarization)
        const userMessages = messages
            .filter(m => m.role === 'user' && typeof m.content === 'string')
            .map(m => m.content as string);

        const assistantMessages = messages
            .filter(m => m.role === 'assistant' && typeof m.content === 'string')
            .map(m => m.content as string);

        return [
            `User discussed: ${userMessages.slice(0, 3).join(', ').slice(0, 200)}...`,
            `Assistant covered: ${assistantMessages.slice(0, 3).join(', ').slice(0, 200)}...`,
        ].join('\n');
    }

    /**
     * Store messages to long-term memory.
     */
    async persist(messages: InternalMessage[], threadId: string): Promise<void> {
        if (!this.config.longTerm) return;

        const documents: VectorDocument[] = messages
            .filter(m => typeof m.content === 'string' && m.content.length > 20)
            .map((m, i) => ({
                id: `${threadId}_${Date.now()}_${i}`,
                content: m.content as string,
                metadata: { role: m.role, threadId },
            }));

        await this.config.longTerm.store.add(documents);
    }

    /**
     * Clear memory for a thread.
     */
    clearThread(threadId: string): void {
        this.summaries.delete(threadId);
    }

    /**
     * Clear all memory.
     */
    async clearAll(): Promise<void> {
        this.summaries.clear();
        if (this.config.longTerm) {
            await this.config.longTerm.store.clear();
        }
    }

    /**
     * Get current summary for a thread.
     */
    getSummary(threadId: string): string | undefined {
        return this.summaries.get(threadId);
    }

    /**
     * Set summary for a thread (manual override).
     */
    setSummary(threadId: string, summary: string): void {
        this.summaries.set(threadId, summary);
    }
}

// ============================================================================
// Helper: Check if message is droppable
// ============================================================================

/**
 * Check if a message is droppable (skill or summary).
 */
export function isDroppable(message: InternalMessage): boolean {
    const meta = message._meta;
    if (!meta?.droppable) return false;
    return meta.skillId != null || meta.summaryId != null;
}
