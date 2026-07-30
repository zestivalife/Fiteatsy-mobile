# Fiteatsy — Capability Map

**Status:** PRODUCT CAPABILITY BASELINE

Status reflects the known direction at documentation time and must be updated from implementation evidence.

| Capability | Description | Status |
|---|---|---|
| Mobile Application | Fiteatsy user experience on mobile | CURRENT |
| Account / Authentication | Fiteatsy account/session foundation | PARTIAL |
| Fiteatsy Client | Product-client aggregate and lifecycle | TARGET |
| Health Profile | Health/profile context | PARTIAL |
| Device Health Integration | Read supported device health sources | PARTIAL |
| Health Connect Integration | Android health-data access | PARTIAL |
| Apple Health Integration | iOS health-data access where implemented/approved | TARGET |
| Cloud Wearable Integrations | Direct provider APIs | FUTURE |
| Health Data Synchronisation | Upload device/provider health observations | PARTIAL |
| Health Data Normalisation | Canonical health observations | TARGET |
| Longitudinal Health Metrics | Historical metric storage/trends | TARGET |
| Medical Report Upload | Upload health/lab reports | PARTIAL |
| Private Report Storage | Durable secure binary report storage | TARGET |
| Report History | Historical report record | TARGET |
| Report Processing | Structured extraction from reports | TARGET |
| Biomarker Extraction | Derive structured biomarker observations | TARGET |
| Biomarker History | Longitudinal biomarker record | TARGET |
| Biomarker Comparison | Previous/current trend comparison | TARGET |
| Medication Records | User medication information | PARTIAL |
| Medication Reminders | Scheduled reminders | PARTIAL |
| Daily Improvement Matrix | Daily health/recovery progress representation | TARGET |
| Recovery Intelligence | Governed trend/recovery computation | TARGET |
| User Health Insights | Explain trends/progress to the user | TARGET |
| Practitioner Monitoring | Authorised professional monitoring | TARGET |
| Consultant Projection | Minimal Fiteatsy client projection in Consultant | TARGET |
| Practitioner Assignment | Professional access authority | EXTERNAL — CAP-003 |
| Platform Person Identity | Cross-product Person identity | EXTERNAL — CAP-001 |
| Assessment Platform | Shared assessment authority where adopted | EXTERNAL — CAP-004 |
| Nutrition Platform | Shared nutrition authority where adopted | EXTERNAL — CAP-005 |
| AI Platform | Governed platform AI capabilities | EXTERNAL — CAP-010 |
| Practitioner Nutrition Intervention | Professional plan creation/modification | TARGET / CAP-005 DEPENDENT |
| Fiteatsy Subscription | Product subscription lifecycle | FUTURE / NOT YET DEFINED |
| Integration Events | Durable cross-system change delivery | TARGET |
| Reconciliation | Detect/repair missed sync | TARGET |
| Notifications | Product reminders/push notifications | PARTIAL |
| Auditability | Trace sensitive operations/integrations | TARGET |

## Capability Groups

```text
FITEATSY
|
+-- Identity & Client
|
+-- Health Data
|   +-- Device Sources
|   +-- Cloud Providers
|   +-- Synchronisation
|   +-- Normalisation
|   +-- Longitudinal Metrics
|
+-- Medical Records
|   +-- Upload
|   +-- History
|   +-- Processing
|   +-- Biomarkers
|   +-- Trends
|
+-- Medication
|   +-- Records
|   +-- Reminders
|
+-- Health / Recovery Intelligence
|   +-- Trend Analysis
|   +-- Improvement Matrix
|   +-- Recovery Indicators
|   +-- User Explanation
|
+-- Practitioner Ecosystem
|   +-- Client Projection
|   +-- Health Monitoring
|   +-- Intervention Context
|   +-- CAP-003 Assignment [external authority]
|
+-- Platform Integration
    +-- CAP-001
    +-- CAP-004
    +-- CAP-005
    +-- CAP-010
```

## Rule

A capability marked TARGET or FUTURE must not be described in implementation reports as completed without repository/runtime evidence.
