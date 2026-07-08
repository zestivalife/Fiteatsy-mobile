# 11 Security

## Purpose

Define baseline security expectations for handling healthcare, identity, communication, and operational data in Fiteatsy.

## Scope

Applies to mobile, backend, dashboard, storage, notifications, AI context, and clinical operations.

Related documents:

- [05 API Contract](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/05_API_CONTRACT.md)
- [10 AI Architecture](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/10_AI_ARCHITECTURE.md)
- [15 Deployment Guide](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/15_DEPLOYMENT_GUIDE.md)

## Authentication

- All production APIs must require authenticated identity
- Sessions or tokens must be short-lived and revocable
- Device binding should be supported for mobile sessions handling health data

## Authorization

- Enforce least-privilege role-based access
- Consultants may only access assigned or explicitly shared cases
- Mentors may access escalation scopes
- Admins may inspect operational data without bypassing publication controls

## Encryption

- TLS for all network traffic
- encryption at rest for databases, object storage, and backups
- secret material must never be committed into the repository

## Audit Logs

Audit log all sensitive actions:

- profile edits
- consultant assignment
- plan publication
- biomarker overrides
- note edits
- auth and permission changes

## Rate Limiting

- login, upload, report processing, and AI endpoints should be rate limited
- admin intelligence endpoints should be protected against scraping and abuse

## Device Management

- allow session revocation
- distinguish active devices
- support client logout from lost devices

## Data Privacy

- collect only necessary care data
- use explicit consent for sharing or family visibility
- provide privacy deletion workflows where legally required

## Healthcare Security

- clinical data access must be role-aware and logged
- avoid exposing raw biomarker or attachment URLs without signed access controls
- consultant communication artifacts are part of the care record and should be secured accordingly

## AI Security

- sensitive data included in prompts must be minimized to task necessity
- prompt logs and model outputs must follow the same retention and access policies as care data

## Responsibilities

- Engineering implements technical controls
- Product designs consent and access UX clearly
- Clinical ops follows access discipline and review workflows

## Future Expansion Notes

- Add field-level encryption for especially sensitive attributes if regulatory scope expands
- Add anomaly detection for unusual staff access patterns

## Implementation Considerations

- Local development shortcuts such as header-based user resolution must remain development-only and never ship as production auth behavior
