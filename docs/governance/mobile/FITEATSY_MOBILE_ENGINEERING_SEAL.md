# FitEatsy Mobile Engineering Seal

## P0-1 Runtime Stability + Launch/Session

- **Accepted engineering SHA:** `3364db31302c87eb1f24b48d71edbc1f906aecd0`
- **Sealed contracts:** 20 `FROZEN_PROTECTED` contracts, enumerated in [`P0_1_RUNTIME_STABILITY_FREEZE.md`](./P0_1_RUNTIME_STABILITY_FREEZE.md)
- **Module acceptance:** `PHYSICAL_ACCEPTANCE_BLOCKED_BY_TOOLING`
- **Unresolved gates:** `CPU_IDLE_PHYSICAL`, `MEMORY_STABILITY_PHYSICAL`
- **Blocker class:** `ENVIRONMENT_TOOLCHAIN_BLOCKER`
- **Application defect open:** No
- **Engineering seal:** `PARTIAL_ACTIVE`

The partial seal protects all proven P0-1 behavior immediately. It does not
convert the two unmeasured physical performance gates into passes and does not
declare the complete module `PRODUCTION_ACCEPTED_CANDIDATE`.

Future changes that overlap startup, session restoration, AppState, root
providers, navigation bootstrap, API connectivity, network recovery, or session
persistence must be classified as `FREEZE_IMPACT` and satisfy the regression and
change policy in the module freeze manifest.

The seal may become fully active for P0-1 only after trustworthy physical CPU
and resident-memory measurements pass using Apple tooling compatible with the
physical device OS.
