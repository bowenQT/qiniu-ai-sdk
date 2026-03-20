# Phase 3 DX Validation Docs API Drift Cleanup Review Packet

Package: `phase3/dx-validation/docs-api-drift-cleanup`
Lane: `dx-validation`
Branch: `codex/phase3/dx-validation/docs-api-drift-cleanup`

## Summary

- Removed stale `QiniuMCPServer` wording that implied `Vframe` support in README and README.zh-CN.
- Clarified that `qiniu-mcp-server` currently exposes `qiniu_chat`, `qiniu_ocr`, `qiniu_image_censor`, `qiniu_video_censor`, and `qiniu_image_generate`.
- Clarified in `COOKBOOK.md` that `QINIU_TOOLS` is broader than the built-in MCP server surface and still includes `qiniu_vframe`.
- Synced `examples/TUTORIAL.md` footer to the current package version.
- Hardened `scripts/verify-docs.mjs` so these drifts fail fast in `npm run test:docs`.

## Changed Files

- `README.md`
- `README.zh-CN.md`
- `COOKBOOK.md`
- `examples/TUTORIAL.md`
- `scripts/verify-docs.mjs`

## Focused Verification

- `npm run build`
- `npm run test:runtime-story-smoke`
- `npm run test:docs`
- `npm run test:template-smoke`

## Docs Impact

- MCP server messaging now matches the current implementation surface instead of the broader `QINIU_TOOLS` surface.
- ResponseAPI contract wording remains present and is now guarded explicitly by `verify-docs`.
- Tutorial version metadata is now kept in sync with `package.json`.

## Deferred Risks

- The docs guard remains text-based, so large structural documentation rewrites can still bypass intent while keeping token strings present.
- This package does not change runtime/cloud/node implementations; future surface changes in those lanes still need matching docs updates.
