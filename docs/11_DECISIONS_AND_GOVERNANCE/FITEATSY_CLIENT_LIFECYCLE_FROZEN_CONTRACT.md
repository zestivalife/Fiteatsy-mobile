# Fiteatsy Client Lifecycle Frozen Contract

Contract ID: `FITEATSY-CLIENT-LIFECYCLE-CONTRACT-v1`

Baseline SHA: `70e8da925bd887071d39909de75828818f584baf`

Status: `FUNCTIONAL FREEZE ACTIVE`

## Protected contract

The following behaviour is frozen at the baseline and must not be changed by Nutrition, catalogue, or presentation work:

- one canonical client identity across mobile, database, Consultant, and Senior Consultant projections;
- eligibility and organisation scoping for Consultant visibility;
- unassigned client allocation and assignment authority;
- at most one active assignment for a client;
- assigned Consultant roster resolution and reassignment semantics;
- Consultant/Senior Consultant role and object-level access controls;
- cross-client and cross-organisation isolation;
- preservation of the accepted client end/lifecycle semantics.

Nutrition work may read the canonical client, profile, assignment, and care-case projections. It must not create a parallel client identity, infer assignment locally, broaden visibility, or alter RBAC.

## Required regression gate

Every candidate touching Nutrition inputs or Consultant Nutrition projection must run `.github/workflows/consultant-database-l3.yml` against the exact candidate and prove:

- missing roster rows: `0`;
- wrong client visibility: `0`;
- duplicate active assignments: `0`;
- unassigned and assigned cohorts resolve correctly;
- cross-client and cross-organisation denial remains enforced.

A source-only comparison is not a substitute for this database-backed gate. A candidate cannot be declared lifecycle-reverified until the exact candidate passes it.

## Change authority

Changes to any protected lifecycle behaviour require explicit product-owner approval and a new accepted lifecycle contract version. A request to revert must restore this baseline or a later explicitly accepted lifecycle baseline, never an older implementation.
