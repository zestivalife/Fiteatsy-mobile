# Archived onboarding health-sync flow

Archived on 2026-10-27 when Apple Health and Android Health Connect were removed
from onboarding.

Health sync remains an optional, standalone feature available after onboarding
from Home and Health Data. The active HealthKit and Health Connect readers are
therefore intentionally retained under `src/services`.

`SyncSuccessScreen.tsx` was already unreachable before this change and is kept
here only as historical UI reference. It is not registered in active navigation.
