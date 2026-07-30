# Fiteatsy — Git & Branch Governance

## Repository

Fiteatsy implementation occurs in the standalone Fiteatsy repository.

Do not mix Consultant repository changes into a Fiteatsy commit.

## Before Work

Record:

- repository root;
- branch;
- HEAD SHA;
- remote;
- working-tree status.

Preserve unrelated/untracked files unless explicitly instructed otherwise.

## Branch Strategy

Use the team's approved branch model.

For controlled milestone implementation, a feature branch is preferable when changes are material.

Do not invent branch merges without Product Owner approval.

## Commit

Completed approved implementation work should be committed with a focused message.

Do not combine unrelated milestones in one commit merely to reduce Git operations.

## Push

When instructed to complete implementation delivery:

- push;
- verify remote branch;
- report SHA;
- verify local HEAD matches expected remote state.

## Destructive Git

Do not:

- force push;
- reset unrelated work;
- delete untracked files;
- rewrite history

without explicit approval.
