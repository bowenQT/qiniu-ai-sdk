---
description: Complete software development workflow using Superpowers skills
---

# Development Cycle Workflow

This workflow integrates all available skills into a complete software development cycle.

// turbo-all

## Phase 1: Design & Planning

### Step 1: UI/UX Design (if frontend work)
```
For frontend work, use the frontend-design skill first to:
- Establish aesthetic direction and visual identity
- Choose typography, colors, and motion patterns
- Design before coding - commit to a bold vision
```

### Step 2: Brainstorm the Idea
```
Use the brainstorming skill to explore requirements and create a design document.
- Ask questions one at a time
- Propose 2-3 approaches with trade-offs
- Present design in 200-300 word sections
- Save to .trellis/plans/YYYY-MM-DD-<topic>-design.md
```

### Step 2b: RFC Self-Review & Design Review
```
Use the rfc-design-review skill to validate the design:
- Phase 1: 14-dimension self-review (problem, external facts, architecture boundaries, etc.)
- Phase 2: Structure review request with "Please Challenge These Decisions"
- User approves → proceed. User challenges → iterate.
```

### Step 3: Set Up Isolated Workspace
```
Use the using-git-worktrees skill to create an isolated development branch.
- Create new branch from main
- Run project setup
- Verify clean test baseline
```

### Step 3b: Product-Scale Lane Setup (for repo-wide changes)
```
If the change spans multiple subsystems, switch to the multi-agent-product-evolution workflow:
- create codex/vnext-integration
- spawn lane worktrees under .worktrees/
- keep the root workspace focused on orchestration only
```

### Step 4: Create Implementation Plan
```
Use the writing-plans skill to break down the design into bite-sized tasks.
- Each task 2-5 minutes
- Exact file paths and code
- TDD: test first, then implement
- Save to .trellis/plans/YYYY-MM-DD-<feature>.md
```

## Phase 2: Implementation

### Step 5: Execute the Plan
Choose based on preference:

**Option A: Task-by-Task with Self-Review**
```
Use the subagent-driven-development skill:
- Execute one task at a time
- Two-stage self-review after each (spec compliance, then quality)
- Commit after each task
```

**Option B: Batch Execution**
```
Use the executing-plans skill:
- Execute tasks in batches of 3
- Report for feedback between batches
- Continue until complete
```

### Step 6: Test-Driven Development
```
Follow the test-driven-development skill for each task:
RED → Write failing test
GREEN → Minimal code to pass
REFACTOR → Clean up
```

## Phase 3: Quality Assurance

### Step 7: Self Code Review
```
Use the requesting-code-review skill:
- Go through review checklist
- Fix Critical and Important issues
- Document findings
```

### Step 8: Verify Before Completion
```
Use the verification-before-completion skill to ensure everything actually works.
- Run all tests
- Manual smoke test
- Check edge cases
```

### Step 8b: Gap Analysis
```
Use the gap-analysis skill to compare implementation against RFC/plan:
- Read original RFC/plan
- Compare each item: ✅ done / ⚠️ deviation / ❌ missing / ⏭️ intentionally deferred
- Fix gaps or document deferral rationale
```

## Phase 4: Completion

### Step 9: Finish Development Branch
```
Use the finishing-a-development-branch skill:
- Verify all tests pass
- Choose: merge, PR, or cleanup
- Clean up worktree if needed
```

---

## When Debugging Issues

If issues arise during any phase:
```
Use the systematic-debugging skill for 4-phase root cause analysis:
1. Observe - What exactly happened?
2. Hypothesize - What could cause this?
3. Test - Verify hypothesis
4. Fix - Apply minimal fix
```

## For Multiple Independent Tasks

When facing 2+ unrelated problems:
```
Use the dispatching-parallel-agents skill:
- Identify independent domains
- Prioritize and order
- Execute sequentially with full focus on each
- Integrate all changes at end
```

## Quick Reference

| Phase | Skills Used |
|-------|-------------|
| Design | frontend-design → brainstorming |
| RFC Review | rfc-design-review |
| Setup | using-git-worktrees |
| Product-scale setup | multi-agent-product-evolution |
| Planning | writing-plans |
| Implementation | executing-plans / subagent-driven-development + test-driven-development |
| Review | requesting-code-review |
| Verification | verification-before-completion |
| Gap Analysis | gap-analysis |
| Completion | finishing-a-development-branch |
| Debugging | systematic-debugging |
| Multi-task | dispatching-parallel-agents |
