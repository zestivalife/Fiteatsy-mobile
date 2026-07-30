# Fiteatsy — Codex Execution Protocol

## Objective

Reduce token/credit usage and prevent uncontrolled cross-domain changes.

## Prompt Pattern

Each Codex task should contain only:

1. task objective;
2. exact repository/path;
3. exact branch;
4. authoritative documents to read;
5. permitted scope;
6. prohibited scope;
7. required tests;
8. required runtime verification;
9. Git instructions;
10. completion-report format.

## Audit Before Implementation

Do not repeat a full repository audit for every task.

Use a narrow audit only when current implementation state for that specific capability is uncertain.

## One Phase Per Prompt

Bad:

```text
Build backend, Railway, health sync, reports, AI, Consultant integration.
```

Preferred:

```text
Implement M3A Fiteatsy Client schema and repository only.
```

Then verify before M3B.

## Evidence Discipline

Codex must distinguish:

- OBSERVED;
- INFERRED;
- ASSUMED;
- BLOCKED.

## No Invented Decisions

If docs mark something PRODUCT DECISION REQUIRED, Codex must stop at the decision boundary rather than inventing product policy.

## Completion Report

Every implementation task should end with:

- implementation status;
- scope completed;
- files changed;
- migrations;
- tests run/results;
- runtime verification;
- security/regression result;
- documentation updated;
- known limitations;
- Git branch/SHA/push status;
- recommended next task.

## Credit Rule

Do not ask Codex to regenerate documentation already frozen unless a code change creates a real contract change.
