# Fiteatsy Splash Freeze Contract

This contract freezes the accepted Fiteatsy cold-launch experience. Any proposed change requires explicit product approval, impact analysis, a fresh native build when native dependencies change, and repeated standalone cold-launch acceptance.

## Canonical owner and assets

- `src/screens/auth/SplashScreen.tsx` is the single user-facing splash owner.
- The canonical video is `https://zestiva.life/assets/Fiteatsy.mp4`.
- The canonical logo is `src/assets/brand/fiteatsy-logo.svg`.
- Legacy branded/static splash artwork must never become user-facing.

## Presentation

- The video fills the screen with cover scaling, autoplays once, is muted, and has no controls.
- A black `rgba(0,0,0,0.70)` overlay sits above the video.
- The canonical SVG remains visible at the horizontal centre near the top.
- The experience has a hard maximum duration of 10 seconds.
- The OS-required native launch bridge is unbranded solid black only.

## Lifecycle and routing

- Every true cold launch starts at the canonical video splash.
- The splash preserves the existing authenticated, onboarding-resume, and logged-out routing decisions.
- Playback/network failure retains the branded black fallback until the maximum-duration routing guard; it must not restore legacy artwork.
- The splash never mutates authentication, onboarding, profile, Nutrition, or other product data.

## Native dependency and release gate

- `expo-video` must exist in the installed native binary. An OTA update cannot add a missing native module.
- A native dependency or runtime-version change requires a fresh native distribution build.
- Acceptance requires a standalone installed build with Metro off, no localhost JavaScript, and the canonical splash visible on three consecutive true cold launches.
- `test/videoIntro.test.ts` is the automated regression guard for ownership, assets, presentation, routing, native bridge, runtime version, and production update channel.

