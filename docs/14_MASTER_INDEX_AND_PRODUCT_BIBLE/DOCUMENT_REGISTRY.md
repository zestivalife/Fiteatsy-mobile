# Fiteatsy — Document Registry

## Authoritative Documentation Groups

| ID | Group | Purpose |
|---|---|---|
| 00 | PRODUCT | Product vision, scope and product-level concepts |
| 01 | ARCHITECTURE | Platform/system architecture |
| 02 | IDENTITY_AND_CLIENT | Account, client identity and lifecycle |
| 03 | BACKEND | Backend structure and service boundaries |
| 04 | DATABASE | Persistence and data ownership |
| 05 | API | API principles and contracts |
| 06 | HEALTH_DATA | Health-source ingestion and longitudinal metrics |
| 07 | MEDICAL_RECORDS_AND_BIOMARKERS | Reports, extraction and biomarkers |
| 08 | MEDICATION_AND_REMINDERS | Medication records and reminder workflows |
| 09 | RECOVERY_AND_HEALTH_INTELLIGENCE | Progress/recovery methodology architecture |
| 10 | CONSULTANT_INTEGRATION | Cross-system integration and CAP-003 boundary |
| 11 | DEPLOYMENT_AND_RAILWAY | Runtime/deployment architecture |
| 12 | SECURITY_PRIVACY_AND_GOVERNANCE | Security/privacy controls |
| 13 | IMPLEMENTATION_ROADMAP_AND_GOVERNANCE | Delivery sequencing and Codex execution |
| 14 | MASTER_INDEX_AND_PRODUCT_BIBLE | Entry point and programme index |

## Precedence

When documents conflict:

1. explicitly approved/frozen newer contract;
2. this Product Bible's ownership/boundary rules;
3. domain-specific authoritative document;
4. current implementation evidence;
5. legacy docs;
6. mock/demo/frontend fixture behaviour.

Code does not automatically override approved architecture.

## Legacy Documentation

Legacy documents that contradict this baseline must be classified and either updated, archived or clearly marked non-authoritative.
