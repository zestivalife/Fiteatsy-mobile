# Fiteatsy Accepted Product Baselines

This manifest records source references and contract owners. An `Accepted SHA` is added only after production-equivalent runtime acceptance. Source-contract verification alone does not advance a runtime baseline.

| Module | Historical/source reference | Contract owner | Runtime acceptance |
| --- | --- | --- | --- |
| Splash | `bf69e45250e4ffdc47d94ada55d392334da9b31f` | `FITEATSY_SPLASH_CONTRACT` | Pending production-equivalent cold-launch verification |
| Onboarding V2 | `c6d49455b13532830f8495750c9a8740554d958a` | `FITEATSY_ONBOARDING_V2_CONTRACT` | Pending incomplete-account device verification |
| Medication | `459c7cdbe9eff1cc648dcea512ea00a6d0372ac8` plus later Foundation integration on `bf69e45250e4ffdc47d94ada55d392334da9b31f` | `FITEATSY_MEDICATION_UX_CONTRACT` | Pending authenticated device verification |
| Foundation | `fa6dd5a` plus later accepted integration on `bf69e45250e4ffdc47d94ada55d392334da9b31f` | `FITEATSY_FOUNDATION_UI_CONTRACT` | Pending cross-screen device verification |
| Canonical client data | `e816e1c` | `FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT` | Pending authenticated account-switch verification |
| Nutrition | `bf69e45250e4ffdc47d94ada55d392334da9b31f` | `FITEATSY_NUTRITION_CONTRACT` | Pending ACTIVE_PUBLISHED device verification |
| Phone identity | `bf69e45250e4ffdc47d94ada55d392334da9b31f` | `FITEATSY_PHONE_IDENTITY_CONTRACT` | Pending provider-backed OTP verification |

## Ownership guard

Canonical route owners are `SplashScreen`, the Onboarding V2 shell/screens, and `MedicationCalendarScreen`. Navigation must never remount known legacy splash, onboarding, or medication components. The permanent source guards live in `test/acceptedProductBaseline.test.ts` and the module-specific contract tests.
