---
description: Publish a new version to npm
---

# Publish Workflow

// turbo-all

1. Check git status is clean
```bash
git status --short
```

2. Update CHANGELOG with new version entry
   - Add `## [x.y.z] - YYYY-MM-DD` section at top
   - Include ✨ New Features, 🔧 Improvements, 📦 Exports subsections

3. Update README.md and README.zh-CN.md
   - Add new features to ✨ Features list
   - Add usage examples to relevant sections

4. Update COOKBOOK.md
   - Add TOC entry
   - Add copy-ready code examples at end

5. Bump version in package.json
```bash
# Manually edit or use:
npm version minor --no-git-tag-version  # for new features
npm version patch --no-git-tag-version  # for bug fixes
```

6. Build the project
```bash
npm run build
```

7. Run unit tests
```bash
npx vitest run
```

8. Stage all changes and commit
```bash
git add -A
git commit -m "chore: release vX.Y.Z"
```

9. Push to remote
```bash
git push origin main
```

10. Publish to npm
```bash
npm publish --access public
```

11. Verify published version
```bash
npm view @bowenqt/qiniu-ai-sdk version
```
