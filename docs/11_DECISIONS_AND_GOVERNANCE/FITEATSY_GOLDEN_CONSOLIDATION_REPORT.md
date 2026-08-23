# Fiteatsy Golden Consolidation Report

## Base and preservation boundary

- Selected base: `a3d2073d296794f4a9b9f172c7b68bca41031f9e` (`origin/main`).
- Reason: it is the newest shared ancestry containing the accepted Foundation, Onboarding V2, Nutrition, native runtime, and freeze contracts. Divergent local `main` is four commits ahead and sixty-one commits behind, so it is evidence rather than a safe base.
- Consolidation branch: `codex/fiteatsy-golden-consolidation`.
- Consolidation worktree: `/private/tmp/fiteatsy-golden-consolidation`.
- Original branches, worktrees, dirty files, untracked files, and native/build evidence were not modified.

## Commit inventory and integration decisions

| Source | Reachable from origin/main | Domain | Decision |
|---|---:|---|---|
| `4a8c5ec` | No | Nutrition daily contracts | Excluded; origin/main contains the newer canonical projection implementation. |
| `7be1bf0` | No | Nutrition daily intelligence | Excluded; superseded by origin/main Nutrition lifecycle and projection work. |
| `9b04845` | No | Home/Tracker recovery | Home superseded by `f86453c`; synthetic Tracker trend hunks excluded. |
| `7f5a349` | No | Medication | Excluded from final tree; origin/main has the newer Foundation-integrated, IST-aware tracker. |
| `f86453c` | No | Journey recovery | Selectively integrated as `1b7818f`; recovery star/orb consumes canonical backend intelligence and has a regression test. |
| Dirty local source | N/A | Splash bootstrap | Integrated only the font-load gate removal so the video splash mounts immediately. |
| Dirty local source | N/A | Phone identity | Integrated canonical legacy lookup, digits-only provider enforcement, tests, and migration `0038`. |
| Dirty local source | N/A | iOS native splash | Removed only the legacy branded launch images; black native bridge remains. |

## Module matrix

| Module | Selected implementation | Acceptance |
|---|---|---|
| Foundation / navigation | origin/main `a3d2073` | Exo, shared components, and five tabs retained. |
| Auth / OTP | origin/main plus canonical phone patch | Canonical presentation/operational split retained; provider rejects non-digits. |
| Onboarding V2 | origin/main `a3d2073` | BASICS → LIFESTYLE → LIFESTYLE · NUTRITION → RECOVERY → CONNECT → READY. |
| Food Preferences | origin/main `a3d2073` | Embedded before Recovery; no Sleep detour. |
| Journey | `f86453c` selective integration | Recovery core and nodes are server-backed; no fixture generation. |
| Tracker | origin/main `a3d2073` | Synthetic seven-day values from divergent local commit excluded. |
| Profile | origin/main `a3d2073` | Canonical profile and transient-state preservation retained. |
| Medication | origin/main `a3d2073` | Foundation tracker, IST semantics, Today/My Medications/History retained. |
| Nutrition | origin/main `a3d2073` | ACTIVE_PUBLISHED delivery and one canonical projection retained. |
| Care / Stress Test / Cycle | origin/main `a3d2073` | Current accepted surfaces and Stress Test terminology retained. |
| Subscriptions | origin/main `a3d2073` | Newer GST and entitlement contracts retained. |
| Health Connect | origin/main `a3d2073` | Android plugin, permissions, diagnostics, and scoped ingestion retained. |
| Video splash | origin/main plus bootstrap/native-artwork patch | Hosted video, 70% overlay, top logo, 10-second cap, black native bridge. |
| Consultant review contracts | origin/main `a3d2073` | Submit/review/change/approve/publish lifecycle retained. |

## Migration dependency graph

Migrations are applied in lexical filename order and recorded by complete filename. The two `0035` filenames therefore have a deterministic order, but their duplicate numeric prefix is documented and must not be renumbered after deployment.

```text
0001 persistence
  → 0002 client identity
    → 0003 ownership
      → 0004 hardening
        → 0005–0013 report/intelligence governance
        → 0014–0015 authentication/PIN compatibility
        → 0016–0017 report retry/audit
        → 0018 admin roles
        → 0019–0021 health calculations/profile
          → 0022 Nutrition plan/version lifecycle
            → 0023 wellness intelligence
            → 0024 meal engine
            → 0026–0027 medication monitoring
            → 0028–0029 assessment engine/content
            → 0031 food preferences
            → 0034 review/approval workflow
        → 0025, 0030 subscription foundations
          → 0035_subscription_plan_catalog_correction
            → 0037 subscription GST snapshot
        → 0032 QA provisioning
          → 0033 professional assignments
            → 0035_professional_names
              → 0036 professional identity backfill
        → 0038 canonical operational phone identity
```

`0038` runs after all existing identity and professional migrations. It performs a collision preflight, canonicalizes legacy 10-digit Indian numbers to `91` + national number, and adds a digits-only constraint. Production execution of earlier migrations cannot be asserted from source alone and requires a read-only query of `schema_migrations` before deployment. No deployment is part of this consolidation.

## Native and OTA configuration

| Contract | Android | iOS / Expo |
|---|---|---|
| Application identity | `com.fiteatsy.health` | `com.fiteatsy.health` |
| EAS project | `70254234-571c-4351-87d9-33e8f851dde1` | Same |
| Updates URL | `https://u.expo.dev/70254234-571c-4351-87d9-33e8f851dde1` | Same |
| Runtime | `1.0.0-native-20260823-video` | Same |
| Channel | Native `expo-channel-name=production` header | Native `expo-channel-name=production` header |
| Native launch bridge | Solid black; no branded artwork | Solid black; legacy imageset absent |
| Video | `expo-video` configured | `ExpoVideo 3.0.16` present in Pod lock |
| Health Connect | Required read permissions and plugin retained | Not expanded to Apple Health |

## Permanent regression gates

- `FITEATSY_FOUNDATION_UI_CONTRACT`
- `FITEATSY_ONBOARDING_V2_CONTRACT`
- `FITEATSY_MEDICATION_UX_CONTRACT`
- `FITEATSY_SPLASH_CONTRACT`
- `FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT`
- `FITEATSY_NUTRITION_CONTRACT`
- `FITEATSY_PHONE_IDENTITY_CONTRACT`
- `FITEATSY_DIET_REVIEW_WORKFLOW_CONTRACT`
- `FITEATSY_HEALTH_DATA_SYNC_CONTRACT`

## Verification boundary

Mobile, canonical-data, TypeScript, backend build, pure backend, config, and diff gates are runnable from this tree. Database-backed backend integration tests require an available local PostgreSQL test database; no production database or deployment is used by this task.
