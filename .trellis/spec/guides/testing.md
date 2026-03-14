# Testing Guide

## Core Commands
- Full unit suite: `npm test`
- Coverage: `npm run test:coverage`
- Build validation: `npm run build`

## Expectations
- Do not claim completion without fresh verification evidence.
- Use targeted Vitest runs when narrowing scope, then finish with the commands required by the verification matrix.
- Changes to exports, build config, or runtime entrypoints require a fresh build.

## Test Layout
- `tests/unit/**`: unit coverage for AI, lib, modules, and integration-like units.
- `tests/node/**`: Node-specific host and integration tests.
- `tests/modules/**`: higher-level module tests.
- `tests/integration/**`: excluded from default Vitest config; run only when intentionally validating integration paths.
