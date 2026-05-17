# Nuetra Behavior Change Operating System

## Mobile (React Native Expo)

- `OnboardingBasics -> OnboardingCalendar -> OnboardingNotifications`
- `Home` as daily hub:
  - Morning check-in (mood, energy, sleep quality)
  - Single AI priority
  - Wellness score + trend vs last week
  - Smart preview based on calendar load
- `Sessions` as in-app micro-actions library
- `Tracker` for progress KPIs
- `Reports` for weekly insights and 4-week trends

## Intelligence Layer

- Input: check-ins, profile, calendar load, nudge history
- Computes:
  - Stress risk
  - Burnout risk
  - Energy deficit
- Output:
  - One priority action
  - Burnout flag (none/watch/alert)
  - One nudge with safe timing
- Decision logs persisted for transparency

## Nudge Guardrails

- Never before 8:00 or after 20:00
- Never in meetings
- Max 3/day
- Each nudge carries one 2-minute action

## Backend (Node + PostgreSQL)

- `/v1/checkins`
- `/v1/intelligence/priority`
- `/v1/nudges/dispatch-check`
- SQL schema includes users, check-ins, decision logs, nudges

## Privacy

- Employer views only aggregated insights
- Individual-level records are private
- Add one-tap delete endpoint in production rollout
