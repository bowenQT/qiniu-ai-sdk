/**
 * Tests for Tool Approval module.
 */

import { describe, it, expect, vi } from 'vitest';
import { checkApproval } from '../../../src/ai/tool-approval';
import type { ApprovalConfig } from '../../../src/ai/tool-approval';

describe('Tool Approval', () => {
    const mockToolCall = {
        id: 'call_123',
        function: {
            name: 'sendEmail',
            arguments: '{"to": "user@example.com"}',
        },
    };

    const mockArgs = { to: 'user@example.com' };
    const mockMessages: Array<{ role: string; content: unknown }> = [
        { role: 'user', content: 'Send an email' },
    ];

    describe('checkApproval', () => {
        it('should approve when requiresApproval is false', async () => {
            const tool = {
                name: 'sendEmail',
                description: 'Send email',
                requiresApproval: false,
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages);

            expect(result.approved).toBe(true);
            expect(result.rejectionMessage).toBeUndefined();
        });

        it('should approve when requiresApproval is undefined', async () => {
            const tool = {
                name: 'sendEmail',
                description: 'Send email',
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages);

            expect(result.approved).toBe(true);
        });

        it('should reject (fail-closed) when requiresApproval=true but no handler', async () => {
            const tool = {
                name: 'sendEmail',
                description: 'Send email',
                requiresApproval: true,
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages);

            expect(result.approved).toBe(false);
            expect(result.rejectionMessage).toContain('No handler configured');
        });

        it('should call global handler when configured', async () => {
            const tool = {
                name: 'sendEmail',
                description: 'Send email',
                requiresApproval: true,
            };

            const config: ApprovalConfig = {
                onApprovalRequired: vi.fn().mockResolvedValue(true),
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages, config);

            expect(result.approved).toBe(true);
            expect(config.onApprovalRequired).toHaveBeenCalledWith(
                expect.objectContaining({
                    toolName: 'sendEmail',
                    args: mockArgs,
                }),
            );
        });

        it('should use per-tool handler over global', async () => {
            const perToolHandler = vi.fn().mockResolvedValue(true);
            const globalHandler = vi.fn().mockResolvedValue(false);

            const tool = {
                name: 'sendEmail',
                description: 'Send email',
                requiresApproval: true,
                approvalHandler: perToolHandler,
            };

            const config: ApprovalConfig = {
                onApprovalRequired: globalHandler,
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages, config);

            expect(result.approved).toBe(true);
            expect(perToolHandler).toHaveBeenCalled();
            expect(globalHandler).not.toHaveBeenCalled();
        });

        it('should auto-approve whitelisted sources', async () => {
            const tool = {
                name: 'sendEmail',
                description: 'Send email',
                requiresApproval: true,
                source: { type: 'builtin' as const, namespace: 'core' },
            };

            const config: ApprovalConfig = {
                autoApproveSources: ['builtin'],
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages, config);

            expect(result.approved).toBe(true);
        });

        it('should auto-approve exact namespace match', async () => {
            const tool = {
                name: 'searchCode',
                description: 'Search code',
                requiresApproval: true,
                source: { type: 'mcp' as const, namespace: 'github' },
            };

            const config: ApprovalConfig = {
                autoApproveSources: ['mcp:github'],
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages, config);

            expect(result.approved).toBe(true);
        });

        it('should reject when handler returns false', async () => {
            const tool = {
                name: 'deleteFile',
                description: 'Delete file',
                requiresApproval: true,
            };

            const config: ApprovalConfig = {
                onApprovalRequired: vi.fn().mockResolvedValue(false),
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages, config);

            expect(result.approved).toBe(false);
            expect(result.rejectionMessage).toContain('denied by user');
        });

        it('should reject when handler throws', async () => {
            const tool = {
                name: 'deleteFile',
                description: 'Delete file',
                requiresApproval: true,
            };

            const config: ApprovalConfig = {
                onApprovalRequired: vi.fn().mockRejectedValue(new Error('Network error')),
            };

            const result = await checkApproval(tool, mockToolCall, mockArgs, mockMessages, config);

            expect(result.approved).toBe(false);
            expect(result.rejectionMessage).toContain('Network error');
        });
    });
});
