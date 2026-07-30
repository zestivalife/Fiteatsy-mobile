# Fiteatsy — Database Migration Deployment

## Current Baseline

Phase 1B introduced:

`backend/src/db/migrations/0001_phase1b_persistence_foundation.sql`

and a migration runner.

The previous completion report stated runtime tests were blocked because local PostgreSQL was unavailable.

Therefore Railway staging is the correct place to close runtime verification.

## Deployment Requirements

A migration deployment must verify:

1. database reachable;
2. expected migration applied;
3. application starts successfully;
4. schema matches expected application version;
5. critical reads/writes succeed.

## Migration Safety

Do not mark deployment accepted merely because migration command exited successfully.

## Startup Migration

If migrations run automatically on application startup, verify:

- concurrent instance safety;
- migration locking;
- failure behaviour;
- startup/readiness behaviour.

If these cannot be guaranteed, use an explicit release/migration step instead.

## Destructive Changes

Destructive migrations require:

- backup/recovery consideration;
- compatibility analysis;
- rollback/forward-fix plan;
- explicit approval.
