# Fiteatsy — Backend Security Boundaries

**Status:** ACTIVE

## 1. Authentication Boundary

The backend validates account/session identity.

The mobile client is untrusted input.

## 2. Object-Level Authorization

Every sensitive resource must validate that the authenticated actor may access that specific object.

This applies to:

- profiles;
- reports;
- biomarkers;
- medications;
- health observations;
- care/recovery records.

## 3. Practitioner Access

Practitioner access is not inferred from Fiteatsy account roles or legacy assignment fields.

The target platform authority is CAP-003.

## 4. Service Credentials

Provider and service credentials must be stored server-side or in approved deployment secret stores.

Never embed confidential service secrets in the mobile application or Git repository.

## 5. Medical Reports

Report files require:

- private storage;
- authenticated/authorised retrieval;
- non-public object URLs by default;
- controlled temporary access mechanisms where required;
- auditability for sensitive professional access.

## 6. Data Minimisation

Cross-system APIs expose only fields needed by the receiving purpose.

## 7. Logging

Do not indiscriminately log:

- Bearer/session tokens;
- OTP secrets;
- medical-report contents;
- full health payloads;
- provider credentials;
- sensitive personal health data.

## 8. Production Guards

Production must reject demo identities, implicit ownership fallbacks and fixture-backed health truth.
