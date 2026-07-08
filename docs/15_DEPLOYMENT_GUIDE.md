# 15 Deployment Guide

## Purpose

Describe how Fiteatsy should be run across development, QA, staging, and production, including platform migration concerns.

## Scope

Applies to the mobile app build pipeline, backend services, database, secrets, and monitoring expectations.

Related documents:

- [04 Database Architecture](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/04_DATABASE_ARCHITECTURE.md)
- [11 Security](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/11_SECURITY.md)
- [14 Testing Guidelines](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/14_TESTING_GUIDELINES.md)

## Environment Stages

### Development

- local React Native / Expo development
- local backend service with mock or in-memory stores
- fast iteration and smoke validation

### QA

- seeded data
- real contract validation
- report pipeline checks
- assignment and notification scenario testing

### Staging

- production-like auth, DB, storage, and queues
- migration rehearsals
- end-to-end operational testing with dashboard and mobile together

### Production

- locked secrets
- observability enabled
- rollback readiness
- clinically safe release windows for high-impact changes

## Environment Variables

Should include at minimum:

- API base URLs
- database connection
- auth secrets
- storage credentials
- notification provider credentials
- AI provider credentials

## Database Migrations

- schema changes must be versioned
- backward compatibility required for rolling deploys
- data backfills should be repeatable and observable

## Secrets

- never commit secrets
- rotate credentials periodically
- segregate environment-specific credentials

## Rollback

- support app rollback and backend rollback independently
- protect backward compatibility so previous clients can still function during staged rollout

## Monitoring

Track at minimum:

- API error rates
- report processing failures
- assignment sync failures
- notification delivery issues
- lifecycle transition anomalies
- AI draft generation failures

## Responsibilities

- Engineering owns deployment automation and rollback
- Product and ops coordinate release impact
- Clinical leadership should be aware of changes affecting consultant or client care workflows

## Future Expansion Notes

- add queue monitoring and dead-letter handling once async infrastructure lands
- add analytics around readiness conversion and follow-up timeliness

## Implementation Considerations

- Current local backend foundation builds successfully, but production readiness requires repository-backed persistence, real auth, and operational monitoring before external rollout
