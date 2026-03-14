---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Sequential Task Execution with Two-Stage Review

Execute plan by working through tasks sequentially, with two-stage self-review after each: spec compliance review first, then code quality review.

**Core principle:** One task at a time + two-stage self-review (spec then quality) = high quality, focused iteration

## When to Use

**Use when:**
- Have an implementation plan with defined tasks
- Tasks are mostly independent
- Want to stay in current session
- Need disciplined review between tasks

**vs. Executing Plans (batch mode):**
- Same session (no context switch)
- Reviews after each task (not after batch)
- Two-stage review: spec compliance first, then code quality
- More thorough but slower

## The Process

```
┌─────────────────────────────────────────────────────────┐
│ 1. Read plan, extract all tasks, create task checklist  │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Per Task:                                                │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 2. Implement task following plan steps exactly      │ │
│  └───────────────────────────┬─────────────────────────┘ │
│                              ▼                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 3. Self-Review: Spec Compliance                     │ │
│  │    - Does code match what plan specified?           │ │
│  │    - All steps completed?                           │ │
│  │    - Tests written and passing?                     │ │
│  └───────────────────────────┬─────────────────────────┘ │
│                              ▼                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 4. Self-Review: Code Quality                        │ │
│  │    - Clean, readable code?                          │ │
│  │    - No obvious bugs or edge cases missed?          │ │
│  │    - Follows project conventions?                   │ │
│  └───────────────────────────┬─────────────────────────┘ │
│                              ▼                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 5. Commit and mark task complete                    │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 6. More tasks? → Loop back to step 2                     │
│    All done? → Final review of entire implementation     │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Use finishing-a-development-branch skill              │
└─────────────────────────────────────────────────────────┘
```

## Self-Review Checklists

### Spec Compliance Review (after each task)

Ask yourself:
- [ ] Did I implement exactly what the plan specified?
- [ ] Did I follow each step in order?
- [ ] Did I run verifications as specified?
- [ ] Do tests cover the new functionality?
- [ ] Are tests passing?

**If any NO**: Fix before proceeding.

### Code Quality Review (after spec passes)

Ask yourself:
- [ ] Is the code clean and readable?
- [ ] Are there obvious bugs or edge cases missed?
- [ ] Does it follow project conventions?
- [ ] Is error handling appropriate?
- [ ] Would a colleague understand this code?

**If any NO**: Fix before proceeding.

## Example Workflow

```markdown
## Task 1: Add User Authentication

[Read task from plan]
[Implement following plan steps exactly]
[Run: npm test -- auth.test.ts]

### Spec Compliance Self-Review
✓ JWT middleware added as specified
✓ Login endpoint created with correct path
✓ Tests written for happy path and error cases
✓ All tests passing

### Code Quality Self-Review
✓ Clean separation of concerns
✓ Error messages are user-friendly
✓ Follows existing auth patterns in codebase

[Commit: feat(auth): add user authentication]
[Mark task complete]

## Task 2: Add User Profile
[Continue to next task...]
```

## Final Review

After all tasks complete:

1. **Run full test suite** - Verify nothing broke
2. **Review all changes** - Quick scan of all commits
3. **Check integration** - Do components work together?

Then use **finishing-a-development-branch** skill.

## Red Flags - STOP and Reassess

- Task requires significant deviation from plan
- Tests keep failing after multiple attempts
- Unclear what the plan wants
- Dependencies between tasks are blocking

**When blocked**: Stop and ask for clarification rather than guessing.

## Integration

- **writing-plans** - Creates the plan this skill executes
- **test-driven-development** - Follow TDD within each task
- **finishing-a-development-branch** - After all tasks complete
