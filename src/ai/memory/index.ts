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
import type { QiniuAI } from '../../client';
import { estimateMessageTokens, estimateMessagesTokens } from '../../lib/token-estimator';

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
    /** Summarization type: 'simple' (concatenation) or 'llm' (LLM-based) */
    type?: 'simple' | 'llm';
    /** QiniuAI client for LLM summarization (required if type='llm') */
    client?: QiniuAI;
    /** Model for LLM summarization */
    model?: string;
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

/** Fine-grained token budget configuration */
export interface TokenBudgetConfig {
    /** Token budget for summary messages */
    summary?: number;
    /** Token budget for retrieved context */
    context?: number;
    /** Token budget for active conversation */
    active?: number;
}

/** Memory manager configuration */
export interface MemoryConfig {
    /** Short-term memory (sliding window) */
    shortTerm?: ShortTermMemoryConfig;
    /** Long-term memory (vector store) */
    longTerm?: LongTermMemoryConfig;
    /** Automatic summarization */
    summarizer?: SummarizerConfig;
    /** Fine-grained token budget control */
    tokenBudget?: TokenBudgetConfig;
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

/** InMemoryVectorStore configuration */
export interface InMemoryVectorStoreConfig {
    /** Maximum number of documents (default: unlimited) */
    maxEntries?: number;
    /** Eviction policy when maxEntries reached (default: 'lru') */
    evictionPolicy?: 'lru' | 'fifo';
    /** Warn when usage exceeds this threshold (0-1, default: 0.8) */
    warnThreshold?: number;
    /** Warning callback when threshold exceeded */
    onWarn?: (usage: number, maxEntries: number) => void;
}

/**
 * Simple in-memory vector store for testing and small-scale use.
 * Uses cosine similarity for search (requires embeddings).
 * 
 * @example
 * ```typescript
 * const store = new InMemoryVectorStore({
 *     maxEntries: 1000,
 *     warnThreshold: 0.8,
 *     onWarn: (usage, max) => console.warn(`Vector store ${usage}% full`),
 * });
 * ```
 */
export class InMemoryVectorStore implements VectorStore {
    private documents: VectorDocument[] = [];
    private accessOrder: Map<string, number> = new Map(); // id -> last access time
    private accessCounter = 0;
    private readonly config: Required<Omit<InMemoryVectorStoreConfig, 'onWarn'>> & Pick<InMemoryVectorStoreConfig, 'onWarn'>;

    constructor(config: InMemoryVectorStoreConfig = {}) {
        this.config = {
            maxEntries: config.maxEntries ?? Infinity,
            evictionPolicy: config.evictionPolicy ?? 'lru',
            warnThreshold: config.warnThreshold ?? 0.8,
            onWarn: config.onWarn,
        };
    }

    async add(documents: VectorDocument[]): Promise<void> {
        for (const doc of documents) {
            // De-duplicate: remove existing doc with same id
            const existingIndex = this.documents.findIndex(d => d.id === doc.id);
            if (existingIndex !== -1) {
                this.documents.splice(existingIndex, 1);
                // Keep accessOrder entry, just update it below
            }

            // Check if we need to evict (only for new entries, not updates)
            if (existingIndex === -1 &&
                this.config.maxEntries !== Infinity &&
                this.documents.length >= this.config.maxEntries) {
                this.evict();
            }

            this.documents.push(doc);
            this.accessOrder.set(doc.id, this.accessCounter++);
        }

        // Check warning threshold
        this.checkWarningThreshold();
    }

    async search(query: string, limit = 5): Promise<VectorDocument[]> {
        // Simple text search (no embeddings)
        // In production, use proper embeddings and vector similarity
        const queryLower = query.toLowerCase();
        const scored = this.documents.map(doc => ({
            doc,
            score: this.textSimilarity(queryLower, doc.content.toLowerCase()),
        }));

        const results = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.doc);

        // Update access time for LRU
        for (const doc of results) {
            this.accessOrder.set(doc.id, this.accessCounter++);
        }

        return results;
    }

    async clear(): Promise<void> {
        this.documents = [];
        this.accessOrder.clear();
        this.accessCounter = 0;
    }

    /** Get current document count */
    get size(): number {
        return this.documents.length;
    }

    /** Get usage ratio (0-1) */
    get usage(): number {
        if (this.config.maxEntries === Infinity) return 0;
        return this.documents.length / this.config.maxEntries;
    }

    private evict(): void {
        if (this.documents.length === 0) return;

        if (this.config.evictionPolicy === 'fifo') {
            // Remove oldest added
            const removed = this.documents.shift();
            if (removed) this.accessOrder.delete(removed.id);
        } else {
            // LRU: remove least recently accessed
            let lruId: string | undefined;
            let lruTime = Infinity;

            for (const [id, time] of this.accessOrder) {
                if (time < lruTime) {
                    lruTime = time;
                    lruId = id;
                }
            }

            if (lruId) {
                const index = this.documents.findIndex(d => d.id === lruId);
                if (index !== -1) {
                    this.documents.splice(index, 1);
                    this.accessOrder.delete(lruId);
                }
            }
        }
    }

    private checkWarningThreshold(): void {
        if (this.config.maxEntries === Infinity || !this.config.onWarn) return;

        const usage = this.usage;
        if (usage >= this.config.warnThreshold) {
            this.config.onWarn(Math.round(usage * 100), this.config.maxEntries);
        }
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

        // 5. Apply token budget enforcement
        if (this.config.tokenBudget) {
            const [trimmed, budgetDropped] = this.applyTokenBudget(processedMessages, threadId);
            processedMessages = trimmed;
            droppedCount += budgetDropped;
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
     * Supports 'simple' (concatenation) and 'llm' (LLM-based) modes.
     */
    protected async generateSummary(
        messages: InternalMessage[],
        _threadId: string,
        abortSignal?: AbortSignal
    ): Promise<string> {
        const config = this.config.summarizer;

        // LLM-based summarization
        if (config?.type === 'llm') {
            if (!config.client) {
                console.warn('[MemoryManager] type=llm but no client provided, using simple');
            } else {
                try {
                    const serializedMessages = messages
                        .map(m => this.serializeMessage(m))
                        .join('\n');

                    const systemPrompt = config.systemPrompt ??
                        'Summarize the following conversation concisely, preserving key facts, decisions, and tool actions. Output only the summary.';

                    const response = await config.client.chat.create({
                        model: config.model ?? 'gemini-2.5-flash',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: serializedMessages },
                        ],
                    });

                    const content = response.choices[0]?.message?.content;
                    if (content && typeof content === 'string' && content.trim()) {
                        return content.trim();
                    }
                    // Empty response: fallback to simple
                    console.warn('[MemoryManager] LLM returned empty summary, using simple');
                } catch (error) {
                    console.warn('[MemoryManager] LLM summarization failed, using simple:', error);
                }
            }
        }

        // Fallback: simple concatenation
        return this.simpleConcat(messages);
    }

    /**
     * Simple concatenation summarization.
     */
    private simpleConcat(messages: InternalMessage[]): string {
        const userMessages = messages
            .filter(m => m.role === 'user')
            .map(m => this.serializeMessage(m))
            .slice(0, 3);

        const assistantMessages = messages
            .filter(m => m.role === 'assistant')
            .map(m => this.serializeMessage(m))
            .slice(0, 3);

        return [
            `User discussed: ${userMessages.join(', ').slice(0, 200)}...`,
            `Assistant covered: ${assistantMessages.join(', ').slice(0, 200)}...`,
        ].join('\n');
    }

    /**
     * Serialize message content for summarization.
     * Handles string, multimodal arrays, and tool calls.
     * Priority: tool_calls > string content > multimodal > unknown
     */
    private serializeMessage(msg: InternalMessage): string {
        // Tool calls (check first - common case where content is '')
        if ((msg as any).tool_calls && (msg as any).tool_calls.length > 0) {
            const toolCalls = (msg as any).tool_calls;
            const toolNames = toolCalls.map((t: any) => t.function?.name || 'unknown').join(', ');
            // Include content if non-empty
            const content = typeof msg.content === 'string' && msg.content.trim()
                ? ` - ${msg.content}`
                : '';
            return `[Tool calls: ${toolNames}]${content}`;
        }

        // Tool result
        if (msg.role === 'tool') {
            const content = typeof msg.content === 'string' ? msg.content : '[result]';
            return `[Tool result: ${content.slice(0, 100)}]`;
        }

        // String content
        if (typeof msg.content === 'string') {
            return msg.content;
        }

        // Multimodal content (array of parts)
        if (Array.isArray(msg.content)) {
            const textParts = msg.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join(' ');
            return textParts || '[non-text content]';
        }

        return '[unknown content]';
    }

    /**
     * Apply token budget enforcement to messages.
     * Trims summary, context, and active messages to fit within budgets.
     * PRESERVES original message order (important for system prompt precedence).
     * 
     * @returns [trimmedMessages, droppedByBudget]
     */
    private applyTokenBudget(
        messages: InternalMessage[],
        threadId: string
    ): [InternalMessage[], number] {
        const budget = this.config.tokenBudget!;
        let droppedByBudget = 0;

        // Track which messages to keep (by index)
        const keepIndices = new Set<number>();

        // Categorize messages by index
        const summaryIndices: number[] = [];
        const contextIndices: number[] = [];
        const activeIndices: number[] = [];

        messages.forEach((msg, idx) => {
            if (msg._meta?.summaryId?.startsWith('summary_')) {
                summaryIndices.push(idx);
            } else if (msg._meta?.summaryId?.startsWith('context_')) {
                contextIndices.push(idx);
            } else {
                activeIndices.push(idx);
            }
        });

        // 1. Apply summary budget (undefined = no limit, 0 = drop all)
        if (budget.summary !== undefined) {
            let tokens = 0;
            for (const idx of summaryIndices) {
                const msgTokens = estimateMessageTokens(messages[idx] as any);
                if (tokens + msgTokens <= budget.summary) {
                    keepIndices.add(idx);
                    tokens += msgTokens;
                } else {
                    droppedByBudget++;
                }
            }
        } else {
            summaryIndices.forEach(idx => keepIndices.add(idx));
        }

        // 2. Apply context budget (undefined = no limit, 0 = drop all)
        if (budget.context !== undefined) {
            let tokens = 0;
            for (const idx of contextIndices) {
                const msgTokens = estimateMessageTokens(messages[idx] as any);
                if (tokens + msgTokens <= budget.context) {
                    keepIndices.add(idx);
                    tokens += msgTokens;
                } else {
                    droppedByBudget++;
                }
            }
        } else {
            contextIndices.forEach(idx => keepIndices.add(idx));
        }

        // 3. Apply active budget (undefined = no limit, 0 = drop all)
        // Process from end to keep most recent, but ALWAYS keep at least 1
        if (budget.active !== undefined) {
            let tokens = 0;
            const keptActiveIndices: number[] = [];
            for (let i = activeIndices.length - 1; i >= 0; i--) {
                const idx = activeIndices[i];
                const msgTokens = estimateMessageTokens(messages[idx] as any);
                if (tokens + msgTokens <= budget.active || keptActiveIndices.length === 0) {
                    // Always keep at least the most recent message
                    keptActiveIndices.push(idx);
                    tokens += msgTokens;
                } else {
                    droppedByBudget++;
                }
            }
            keptActiveIndices.forEach(idx => keepIndices.add(idx));
        } else {
            activeIndices.forEach(idx => keepIndices.add(idx));
        }

        // Rebuild messages preserving original order
        const result = messages.filter((_, idx) => keepIndices.has(idx));

        return [result, droppedByBudget];
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
