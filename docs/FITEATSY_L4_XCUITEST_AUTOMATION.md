# Fiteatsy L4 real-user simulator automation

## Contract

`FiteatsyUITests` is the canonical repository-owned iOS UI automation target. It drives the real app with XCUITest only. It does not inject authentication, write session storage, bypass navigation, mock the backend, or expose a hidden route.

The safe tests prove cold launch, session restoration, bottom navigation, Tracker hierarchy, Reports V2 upload-sheet stability and picker cancellation, Nutrition and Medication read-only rendering, screen leave/return, background/foreground, rapid tab interaction, screenshot evidence, termination, and relaunch. They use the current authenticated app session without mutating clinical or onboarding data.

The full onboarding test additionally proves physical ruler drags, Food Preferences search/save, persistence, and resume. It runs only when an already authenticated, governed `QA_TEST` simulator session exists and `FITEATSY_GOVERNED_QA_TEST_READY=1` is supplied to the test process.

Without that governed session, the mutating test must report:

`BLOCKED — GOVERNED QA_TEST SESSION REQUIRED`

It must never run against Lalit or another real client.

## Run

```bash
FITEATSY_IOS_SIMULATOR_UDID=<simulator-udid> \
  ./scripts/run-l4-xcuitest.sh
```

Use a unique `FITEATSY_XCRESULT_PATH` for every run. Result bundles and screenshot attachments are deterministic release evidence and are intentionally not overwritten by the runner.

The runner uses the Release test configuration so the app contains its JavaScript bundle. It does not depend on Metro and fails at build time instead of launching an unusable Debug shell with no script URL.

## Stable identifier families

- `onboarding.*`, `height.*`, `weight.*`
- `food.*`, `healthConnect.*`, `ready.*`
- `home.*`, `tracker.*`, `reports.*`, `nutrition.*`, `medication.*`
- `care.*`, `profile.*`

## Permanent acceptance matrix

### Safe authenticated simulator coverage

- Journey/Home and Recovery Core truthfulness
- Tracker: Health, Wellness, Overview, Activity, Heart, Sleep
- Reports V2: open/dismiss/reopen upload sheet three times and cancel the system PDF picker
- Nutrition and Medication read-only surfaces
- Five-item bottom navigation and selected state
- Leave/return, background/foreground, terminate/relaunch, and rapid tab switching
- Runtime-error detection and screenshot evidence

### Governed QA-only coverage

- Height and Weight physical ruler interaction
- Food Preferences search/save and double-tap protection
- Onboarding resume and Ready/Home transition

### Physical-device-only acceptance

- Android Health Connect permission and observation sync
- iOS HealthKit permission and observation sync
- Real notification delivery, biometric prompts, and device-specific system integrations

## Frozen safety rules

- No real-client onboarding mutation.
- No auth/session injection or bypass.
- No report upload, medication event, nutrition event, or other clinical mutation in safe tests.
- No simulator-only product behavior.
- No native distribution build is part of this suite.
- UI identifiers are presentation-only and must not change product logic.
