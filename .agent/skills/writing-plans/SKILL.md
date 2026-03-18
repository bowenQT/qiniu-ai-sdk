---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code. In this repository, multi-subsystem or lane-scoped work must create the package brief first and keep the plan aligned with the bounded package contract.
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `.trellis/plans/YYYY-MM-DD-<feature-name>.md`

## Repo Override: Package-First Work

If the task touches multiple subsystem groups, uses lanes, or needs a tracked review handoff:

1. create the package brief first
2. align the plan to the brief's lane, topic, goal, and out-of-scope notes
3. use the `package-first-sdk-delivery` skill for execution and closeout

Use:

```bash
qiniu-ai package init --lane <lane> --topic <topic> --goal <goal> --phase <phase> --success "<criterion>"
```

Then write the promoted plan under `.trellis/plans/` using the same topic slug.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
```

## Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits

## Execution Handoff

After saving the plan:

**"Plan complete and saved to `.trellis/plans/<filename>.md`. Ready to execute?"**

**If yes:**
- For package-first work: use `package-first-sdk-delivery`
- **REQUIRED SUB-SKILL:** Use executing-plans to work through tasks in batches
- Alternative: Use subagent-driven-development for task-by-task execution with self-review
- Follow TDD for each task
- Commit after each task passes
