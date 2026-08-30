# Fiteatsy L4 real-user simulator automation

## Contract

`FiteatsyUITests` is the canonical repository-owned iOS UI automation target. It drives the real app with XCUITest only. It does not inject authentication, write session storage, bypass navigation, mock the backend, or expose a hidden route.

The safe smoke test proves cold launch, element discovery, swipe, screenshot evidence, termination, and relaunch. The full onboarding test additionally proves taps, text entry, physical ruler drags, Food Preferences, persistence, and resume. The full test runs only when an already authenticated, governed `QA_TEST` simulator session exists and `FITEATSY_GOVERNED_QA_TEST_READY=1` is supplied to the test process.

Without that governed session, the mutating test must report:

`BLOCKED — GOVERNED QA_TEST SESSION REQUIRED`

It must never run against Lalit or another real client.

## Run

```bash
FITEATSY_IOS_SIMULATOR_UDID=<simulator-udid> \
  ./scripts/run-l4-xcuitest.sh
```

Use a unique `FITEATSY_XCRESULT_PATH` for every run. Result bundles and screenshot attachments are deterministic release evidence and are intentionally not overwritten by the runner.

## Stable identifier families

- `onboarding.*`, `height.*`, `weight.*`
- `food.*`, `healthConnect.*`, `ready.*`
- `home.*`, `tracker.*`, `reports.*`, `nutrition.*`, `medication.*`

## Frozen safety rules

- No real-client onboarding mutation.
- No auth/session injection or bypass.
- No simulator-only product behavior.
- No native distribution build is part of this suite.
- UI identifiers are presentation-only and must not change product logic.
