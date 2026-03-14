---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

# Divide and Conquer Execution

When you have multiple unrelated problems (different test files, different subsystems, different bugs), investigating them as one giant task wastes mental energy. Break them into focused, independent tasks and execute sequentially.

**Core principle:** One focused task at a time. Complete isolation between problem domains.

## When to Use

**Use when:**
- 3+ problems across different domains
- Each problem can be understood independently
- No shared state between investigations
- Solving one doesn't affect others

**Don't use when:**
- Problems are related (fix one might fix others)
- Need to understand full system state first
- Exploratory debugging (don't know what's broken yet)

## The Pattern

### 1. Identify Independent Domains

Group failures/tasks by what's broken:
- Domain A: Authentication flow
- Domain B: Data validation
- Domain C: UI rendering

Each domain is independent - fixing auth doesn't affect UI tests.

### 2. Prioritize and Order

Rank by:
1. **Blocking others?** - Do first
2. **Quick wins?** - Build momentum
3. **Highest risk?** - Address early

### 3. Execute Sequentially with Full Focus

For each domain:
```markdown
## Domain: [Name]

### Context
[Full context for this problem only]

### Goal
[Specific, measurable outcome]

### Constraints
- Don't touch code outside this domain
- Complete this before moving to next

### Execute
[Work through the problem]

### Summary
[What was found, what was fixed]

---
[Move to next domain]
```

### 4. Review and Integrate

After all domains complete:
- Review all changes together
- Verify no conflicts between fixes
- Run full test suite
- Integrate all changes

## Task Structure

Each task should be:

**✅ Focused** - One clear problem domain
```markdown
Fix the 3 failing tests in auth.test.ts
```

**✅ Self-contained** - All context included
```markdown
Errors:
1. "should validate token" - expects valid, got expired
2. "should refresh token" - timeout after 5000ms
3. "should logout" - session not cleared
```

**✅ Specific about outcome**
```markdown
Outcome: All 3 tests passing, no new failures introduced
```

**✅ Constrained**
```markdown
Constraint: Only modify auth/ directory
```

## Common Mistakes

**❌ Too broad:** "Fix all the tests"
**✅ Specific:** "Fix auth.test.ts failures"

**❌ No context:** "Fix the race condition"
**✅ Context:** Include error messages, test names, file paths

**❌ No constraints:** Might refactor everything
**✅ Constraints:** "Only modify auth/ directory"

**❌ Vague outcome:** "Fix it"
**✅ Specific:** "All tests green, document root cause"

## Example Workflow

**Scenario:** 6 test failures across 3 files

**Step 1: Identify Domains**
```markdown
- auth.test.ts: 3 failures (authentication)
- data.test.ts: 2 failures (data validation)
- ui.test.ts: 1 failure (rendering)
```

**Step 2: Prioritize**
1. auth (blocks login feature)
2. data (quick win - 2 related tests)
3. ui (isolated, low risk)

**Step 3: Execute Domain 1**
```markdown
## Domain: Authentication (auth.test.ts)

### Context
3 failures related to token handling...

### Execute
[Full focus on auth only]
[Found: Token expiry not checked correctly]
[Fixed: Added expiry validation]

### Summary
Root cause: Missing expiry check
Fix: Added validation in validateToken()
Tests: All 3 passing
```

**Step 4: Execute Domain 2**
```markdown
## Domain: Data Validation (data.test.ts)
...
```

**Step 5: Execute Domain 3**
```markdown
## Domain: UI Rendering (ui.test.ts)
...
```

**Step 6: Integrate**
```markdown
## Integration Check
- All domains complete
- No conflicts between fixes
- Full test suite: 127 passing, 0 failing
- Ready to commit
```

## Key Benefits

1. **Focus** - Narrow scope, less context to track
2. **Independence** - Each domain complete before next
3. **Clarity** - Clear what's done vs pending
4. **Quality** - Full attention on each problem

## When NOT to Use

**Related failures:** Investigate together first
**Need full context:** Understanding requires entire system
**Exploratory:** You don't know what's broken yet

## Integration

- **systematic-debugging** - Use within each domain
- **verification-before-completion** - After each domain
- **finishing-a-development-branch** - After all domains complete
