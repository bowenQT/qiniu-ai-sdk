---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Self Code Review

Perform systematic self-review to catch issues before they cascade.

**Core principle:** Review early, review often. Be your own harshest critic.

## When to Review

**Mandatory:**
- After each task completion
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (forces fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## The Review Process

### 1. Prepare Review Context

```bash
# Get the diff range
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)

# View all changes
git diff $BASE_SHA $HEAD_SHA
```

### 2. Self-Review Checklist

Go through each category systematically:

#### Spec Compliance
- [ ] Does implementation match requirements?
- [ ] All acceptance criteria met?
- [ ] No scope creep (extra features not requested)?

#### Code Quality
- [ ] Clean, readable code?
- [ ] Follows project conventions?
- [ ] No obvious code smells?
- [ ] DRY - no copy-paste code?

#### Error Handling
- [ ] Edge cases handled?
- [ ] Errors fail gracefully?
- [ ] Meaningful error messages?

#### Testing
- [ ] Tests cover new functionality?
- [ ] Tests actually test the right thing?
- [ ] All tests passing?

#### Security (if applicable)
- [ ] No hardcoded secrets?
- [ ] Input validation present?
- [ ] No obvious vulnerabilities?

### 3. Document Findings

```markdown
## Self-Review: [Feature Name]

**Changes:** [Brief summary]
**SHA Range:** BASE_SHA..HEAD_SHA

### Strengths
- [What's good about this code]

### Issues Found
- **Critical:** [Blocks deployment]
- **Important:** [Should fix before proceeding]
- **Minor:** [Nice to have, can defer]

### Assessment
[ ] Ready to proceed
[ ] Needs fixes first
```

### 4. Fix Issues

**Priority order:**
1. Fix Critical issues immediately
2. Fix Important issues before proceeding
3. Note Minor issues for later (create TODO or issue)

## Example

```markdown
[Just completed: Add user authentication]

## Self-Review: User Authentication

**Changes:** JWT middleware, login/logout endpoints, tests
**SHA Range:** a7981ec..3df7661

### Strengths
- Clean separation of auth logic
- Good test coverage (85%)
- Follows existing patterns

### Issues Found
- **Important:** Missing rate limiting on login endpoint
- **Minor:** Magic number for token expiry (should be config)

### Assessment
[x] Needs fixes first

[Fix rate limiting]
[Commit fix]
[Continue to next task]
```

## Integration with Workflows

**Sequential Task Execution:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans (batch mode):**
- Review after each batch (3 tasks)
- Aggregate findings, fix, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Rush through checklist

**Common Blind Spots:**
- Error handling paths
- Edge cases with null/empty data
- Concurrent access issues
- Security implications

## Tips for Effective Self-Review

1. **Take a break first** - Fresh eyes catch more
2. **Read code as if someone else wrote it** - Be objective
3. **Question everything** - "Why is this here?"
4. **Check the diff, not just the new code** - What changed?
5. **Run the tests, don't assume** - Actually verify
