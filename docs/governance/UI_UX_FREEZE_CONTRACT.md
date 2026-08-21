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

THE CURRENT OVERSIZED FLOATING FOOTER SHOWN IN THE 22 AUG 2026 01:28 SIMULATOR SCREENSHOT IS A KNOWN LEGACY/REGRESSED COMPONENT AND MUST NOT BE USED AS A UI FREEZE BASELINE.

- Canonical component: `src/components/FloatingTabBar.tsx`
- Accepted navigation source SHA: `94791be461c39ba41c6791955bdbf6d59bfc24a6`
- Frozen behaviour: compact floating shell, safe-area-aware bottom padding, icon-only inactive tabs, and a compact horizontal icon-and-label selected state.
- Current required routes: Home, Tracker, Nutrition, Reports, Sessions, Cycle.
