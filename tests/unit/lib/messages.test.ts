import { describe, it, expect } from 'vitest';
import { appendMessages, truncateHistory } from '../../../src/lib/messages';
import type { ChatMessage } from '../../../src/lib/types';

describe('messages helpers', () => {
    it('appendMessages should not mutate history', () => {
        const history: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
        const next = appendMessages(history, { role: 'assistant', content: 'Hello' });

        expect(history).toHaveLength(1);
        expect(next).toHaveLength(2);
        expect(next[1].content).toBe('Hello');
    });

    it('truncateHistory should keep most recent messages within budget', () => {
        const messages: ChatMessage[] = [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'abcd' },
            { role: 'assistant', content: 'abcdefgh' },
        ];

        const truncated = truncateHistory(messages, 3);
        expect(truncated).toHaveLength(2);
        expect(truncated[0].role).toBe('user');
        expect(truncated[1].role).toBe('assistant');
    });

    it('truncateHistory should keep system message when configured', () => {
        const messages: ChatMessage[] = [
            { role: 'system', content: 'system' },
            { role: 'user', content: 'abcd' },
            { role: 'assistant', content: 'abcd' },
        ];

        const truncated = truncateHistory(messages, 2, { keepSystem: true });
        expect(truncated[0].role).toBe('system');
        expect(truncated[truncated.length - 1].role).toBe('assistant');
    });
});
