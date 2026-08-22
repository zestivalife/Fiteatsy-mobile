# Fiteatsy UI/UX Freeze Contract

## Baseline

The current accepted runtime and source are the UI/UX baseline. Historical screenshots, branches, commits, prototypes, archives, and legacy implementations cannot override that baseline automatically.

## Scope rules

1. Screenshots apply only to the feature or module explicitly being discussed.
2. Global shared UI may change only after an explicit user request for an application-wide change.
3. Feature work must preserve the visual appearance of unrelated screens.
4. UI-affecting pull requests must declare every affected screen.
5. Visual regression checks are mandatory for affected screens and shared navigation.
6. Changes to shared components, tokens, typography, colours, spacing, radii, shadows, wrappers, or safe-area behaviour require an impact review of every consumer.
7. Screen-specific requirements should use a scoped variant, prop, wrapper, or local style composition instead of changing global presentation.
8. Merge conflict resolution must preserve the current accepted UI while adding the required functional logic.
9. Surgical merges are preferred over wholesale restoration from legacy source.
10. The current accepted runtime/source wins over historical references unless the user explicitly requests restoration of a named screen from a named reference.

## Required change declaration

Every UI-affecting change must record:

- affected screens;
- shared components or tokens touched;
- expected visual differences;
- widths or devices verified;
- confirmation that unrelated frozen screens remain unchanged.

If an unrelated frozen screen changes, the change must be reverted before acceptance.

## Footer navigation baseline

`PRIMARY_BOTTOM_NAVIGATION_REFERENCE` = attached 20 Aug 2026 16:46:06 (4:46) iPhone simulator screenshot.

- This reference governs FOOTER NAVIGATION ONLY. It must never be interpreted as permission to restore or modify the Home screen, Recovery Core, cards, typography, colours, layouts, or any other screen content shown in that screenshot.
- Canonical component: `src/components/FloatingTabBar.tsx`.
- Frozen primary structure: Journey | Tracker | Nutrition | Care | Profile.
- Frozen treatment: flat black edge-to-edge footer, five evenly distributed icon-above-label destinations, white active state, muted-grey inactive state, compact vertical footprint, and iOS safe-area handling.
- Home, Tracker, Nutrition, Reports, Sessions, Cycle in a six-item floating capsule is LEGACY / REJECTED / DO NOT RESTORE.
- Reports, Sessions, and Cycle remain feature routes and must not be promoted into the primary footer.

## Cold-launch splash baseline

- Canonical app-level owner: `src/screens/auth/SplashScreen.tsx`. No second startup, intro, loading, or legacy splash may compete with it.
- Canonical sequence: true process cold launch → remote `https://zestiva.life/assets/Fiteatsy.mp4` video → 70% black overlay → `src/assets/brand/fiteatsy-logo.svg` → existing Auth, Onboarding V2 resume point, or Main destination.
- The native launch surface is an unbranded black bridge only. It must not display `src/assets/splash.png`, a legacy logo, progress copy, or download state.
- `SPLASH_MAX_DURATION_MS` is fixed at `10000`. Playback failure must retain the dark latest-logo fallback and the timeout must always release the user.
- The splash appears once per true process launch. It must not replay on tab navigation or ordinary background/foreground transitions.
- Production native builds must carry the `expo-channel-name: production` Expo Updates request header on iOS and Android. Missing or mismatched channel metadata is a release blocker because it can launch a stale embedded bundle.

## Change-impact gate

Before any future implementation, record the authorised surface, direct dependencies, shared consumers, persistence/API/cache effects, test boundary, runtime target, and rollback boundary. The smallest viable diff is mandatory. No new feature authorises adjacent redesign, refactoring, fallback replacement, navigation changes, or restoration from historical source.
