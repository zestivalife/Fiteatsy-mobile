# Fiteatsy frozen splash contract

Status: **release-frozen**

Change authority: **explicit product-owner approval only**

## Accepted launch sequence

`native launch surface` → `minimal black bridge` → `video splash` →
`current official logo` → `existing app destination`

The native bridge is intentionally unbranded. It must never display historical
artwork while React Native and the video module initialise.

## Single source-of-truth chain

| Responsibility | Authoritative source |
|---|---|
| Expo launch configuration | `app.json` (`expo.splash`, image-free black bridge) and `plugins/withFrozenSplashBridge.js` (deterministic clean-prebuild enforcement) |
| iOS native bridge | `ios/Fiteatsy/SplashScreen.storyboard` and `ios/Fiteatsy/Images.xcassets/SplashScreenBackground.colorset/Contents.json` |
| Android native bridge | `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/values/styles.xml`, `android/app/src/main/res/values/colors.xml`, and `android/app/src/main/res/drawable/ic_launcher_background.xml` |
| User-facing video splash | `src/screens/auth/SplashScreen.tsx` |
| Official logo | `src/assets/brand/fiteatsy-logo.svg` |
| Automated authority | `scripts/verify-frozen-splash.mjs` and `test/videoIntro.test.ts` |

Generated native files are verification targets, not an independent product
authority. Clean prebuild output must conform to this chain.

## Frozen presentation and fallback

- Video: `https://zestiva.life/assets/Fiteatsy.mp4`.
- Logo: the SVG above, SHA-256
  `59bdffba51d80546750862b5366bde6ec06e6cb9f7b92c19bc99be0a2b7aab0e`.
- Overlay: black at exactly `rgba(0,0,0,0.70)`.
- Maximum experience: 10 seconds.
- Playback/network failure: remain on the canonical black/video-splash surface
  until the existing routing guard exits. Never show historical artwork.
- Reduced motion and all existing auth/onboarding/main routing remain unchanged.

## Prohibited legacy assets

The following historical paths are classified **LEGACY** and removed from the
active source tree. Git history is the retained forensic evidence:

- `src/assets/splash.png` (historical static artwork; SHA-256
  `a30c3e0a7393ea3b566b43fd721c26849eda9ef63ecc3c1c419515256f2b95d3`).
- `android/app/src/main/res/drawable-*/splashscreen_logo.png` (historical
  generated logo panels; the former mdpi SHA-256 was
  `d0221125429fa97d5b3174f719bad2e380d20b9968b890d0ed97f3a460fd43a6`).

No active configuration may reference `splash.png`, `splashscreen_logo`,
`SplashScreenLegacy`, a rounded wordmark panel, or green/grey circle artwork.

## Anti-reversion and prebuild gates

Run before every merge and native release:

```sh
npm run test:splash-contract
```

For clean regeneration, run Expo prebuild in a disposable copy/worktree, never
over an accepted native worktree, then run:

```sh
node scripts/verify-frozen-splash.mjs --root /path/to/disposable-prebuild
```

The verifier fails on legacy files/references, any native image launch surface,
a non-black iOS/Android bridge, a missing video/logo/overlay/timing contract, or
replacement of the official logo. Normal Jest regression also runs the frozen
contract through `test/videoIntro.test.ts`.

## Merge and release checklist

The shared main branch, Android release branch, iOS release branch, and every
future feature branch must pass the guard before merge. Each native release must
also prove on real standalone runtimes:

- iOS cold launch: PASS
- Android cold launch: PASS
- legacy splash: ABSENT
- video splash: PASS
- official logo: PASS
- failure fallback: PASS
- disposable clean prebuild verification: PASS

## Revert semantics

“Revert splash” means restore only this latest frozen contract. Historical
pre-video implementations are never valid revert targets. Any change to native
launch, video, assets, logo placement, overlay, fallback, or launch timing
requires explicit product-owner approval before implementation.
