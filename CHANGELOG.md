# Changelog

## 0.9.0

- Added `image.generate` and `image.waitForResult` to unify sync/async image responses.
- Added image usage types and response normalization for Gemini/Kling differences.
- Deprecated `image.create` and `image.waitForCompletion` in favor of unified APIs.

## 0.8.0

- Added native `generateText` with tool-call loop, reasoning capture, and step tracking.
- Added `ai-tools` subpath with `tool()` helper and Zod-to-JSON schema conversion.
- Added message helpers and new error types for tool execution and max steps.

## 0.7.0

- Added message utilities and native text generation helpers.
- Added examples and unit tests for tool-call execution loop.

## 0.6.0

- Documented advanced usage examples and adapter installation guidance.
- Added cookbook examples and JSDoc audit notes.
- Switched adapter types to official Vercel AI SDK types.
