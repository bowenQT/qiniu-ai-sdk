import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/integration/**/*.e2e.test.ts'],
        testTimeout: 120_000,  // 沙箱创建 + 命令执行可能较慢
        hookTimeout: 60_000,
    },
});
