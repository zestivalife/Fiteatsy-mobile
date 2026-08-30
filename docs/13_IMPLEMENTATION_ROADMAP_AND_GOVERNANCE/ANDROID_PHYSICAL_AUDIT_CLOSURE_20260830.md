# Android physical audit closure — 30 August 2026

## Scope and source boundary

- Candidate branch: `codex/android-p0-recovery-20260830`
- Starting accepted source: `bd378f7dfe60943707020474a8183f6d1e69d4e8`
- Canonical dirty workspace was not used or modified.
- No APK, AAB, OTA, version, runtime, Reports, scanner, B12, biomarker, Consultant, diet, Phase C, Medication, published Nutrition, splash, or iOS change is in scope.

## Health Connect invocation inventory

| Invocation | Trigger | Bounded | Failure owner | Result |
|---|---|---:|---|---|
| permission preparation | explicit `Allow access` | yes | permission screen state | settles to connected-ready, partial, denied, unavailable, or failed |
| SDK availability | explicit permission/sync action | yes | Health Connect screen | never leaves an infinite loader |
| initialise | explicit permission/sync action | yes | Health Connect screen | controlled failure, retry remains available |
| granted permissions | explicit permission/sync action | yes | Health Connect screen | denied/partial is truthful |
| record reads | explicit sync action | yes | metric read boundary | failed reads cannot hang the JS flow |
| Home mount/resume | none | n/a | n/a | automatic sync absent |
| store/provider action | explicit user action only | yes | Health Connect screen | automatic redirect absent |

The exact native crash root cause remains **unknown** without native crash/ADB logs. Source containment is complete: all reachable native operations are bounded and rejected native promises are converted to controlled screen states.

## Nutrition save endpoint trace

The final preference mutation performs canonical profile validation, one transactionally required profile lock/read, the canonical insert/update, and its audit write. Report processing, biomarker intelligence, Consultant synchronisation, diet generation, and published-plan mutation are absent. No unnecessary synchronous downstream pipeline was found. The original physical timeout cause is therefore **not proven**. The client now reconciles canonical state after ambiguous timeout/network/server/conflict outcomes before allowing another mutation; identical state is one canonical profile, not duplicate semantic rows.

## Master closure matrix

| Priority | Issue / state | Physical evidence | Source correction | Automated evidence | Physical verification | Final classification |
|---|---|---|---|---|---|---|
| P0 | Health Connect native crash/hang | physical release audit | bounded SDK, initialise, permission and record calls; single-flight explicit sync | `healthConnectFailureBoundary`, `androidAuditClosure` | new APK/device crash-free execution required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P0 | unsafe automatic Home/resume sync | audit finding | AppState/automatic sync removed | static invocation contract | confirm on new APK | FIXED + AUTOMATED VERIFIED |
| P0 | preference save stuck on `Saving...` | screenshot/video | `finally` releases in-flight state; contextual recoverable error | `foodPreferenceSaveRecovery`, `androidAuditClosure` | repeat slow/offline physical attempt | FIXED + AUTOMATED VERIFIED |
| P0 | ambiguous preference timeout | physical timeout | canonical readback before retry, no automatic second mutation | six recovery cases plus full regression | real-network latency cause remains unproven | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P0 | double-tap/concurrent edit | screenshot | single-flight guard and disabled/pointer-blocked form | audit closure contract | confirm touch behaviour on device | FIXED + AUTOMATED VERIFIED |
| P1 | Health permission explainer | physical flow | consumer read-only/control copy and explicit actions | closure contract | system permission rendering required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | connected/partial/no-data/error truthfulness | physical flow | mutually exclusive stages and action hierarchy | closure and state-boundary tests | native data permutations required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | automatic store detour / Google wording | physical audit | explicit Health Connect action only; Google Fit wording removed | closure contract | confirm provider-unavailable device | FIXED + AUTOMATED VERIFIED |
| P1 | height/weight dead space | physical video | responsive scroll/flex hierarchy retained; direct value entry added | onboarding regression | small/common/large physical render required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | direct metric entry and keyboard | physical audit | bounded numeric entry, keyboard dismissal, Android KAV height | onboarding and closure tests | OEM keyboard verification required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | unit conversion/reinterpretation | audit requirement | canonical conversion path preserved | onboarding regression | physical toggle feel only | FIXED + AUTOMATED VERIFIED |
| P1 | progress accessibility | physical audit | exact step accessibility label, existing step state preserved | closure + onboarding tests | screen-reader pass required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | preference density/chips/internal terms | screenshot | existing section hierarchy retained; technical consumer errors removed; controls disabled while saving | closure/full regression | narrow Android render required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | error/loading hierarchy | screenshots | contextual friendly errors and truthful loading labels | closure/full regression | physical visual check required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | back/restart/resume | audit requirement | persisted runtime progress retained; saving cannot navigate back | onboarding regression | process-kill during native activity required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | completion transition | audit requirement | canonical ready screen/clear-progress transition preserved; splash not reused | onboarding + splash regression | physical timing check required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| P1 | safe area/touch targets/theme | physical audit | shared Shell, tokens, controls and dark theme retained | full regression | device/insets/accessibility verification required | FIXED + PHYSICAL VERIFICATION REQUIRED |
| Frozen | accepted product modules | governance contract | no source edits | diff classification + focused/global tests | none for this source closure | FIXED + AUTOMATED VERIFIED |

## Deterministic resilience expectations

| Case | Final UI contract |
|---|---|
| online success | success, navigation allowed |
| slow response | saving until bounded response, then success/error |
| timeout before mutation | recoverable error; selections retained |
| timeout after mutation | readback match becomes success |
| offline before/during submit | recoverable error; selections retained |
| 500 / 409 | reconcile once, then success if state matches, otherwise recoverable error |
| retry | one new mutation after prior attempt settles |
| double tap | second mutation suppressed |
| readback failure | recoverable/unknown; selections retained |

## Physical-only release checks

The following cannot truthfully be closed without a new native APK and physical Android device: native crash absence, OEM Health Connect permission UI, real-provider availability/no-data/partial-data states, process death while a native call is active, OEM keyboard/insets, screen-reader output, and final visual rendering across small/common/large viewports. They are explicitly not claimed as passed by this source-only audit.

## Build declaration

- APK: NOT GENERATED
- AAB: NOT GENERATED
- OTA: NOT PUBLISHED
