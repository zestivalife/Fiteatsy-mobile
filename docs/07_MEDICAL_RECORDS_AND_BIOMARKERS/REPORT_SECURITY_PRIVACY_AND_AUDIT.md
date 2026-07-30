# Fiteatsy — Report Security, Privacy & Audit

## Sensitivity

Medical/laboratory reports and derived biomarker histories are sensitive health data and require stronger controls than ordinary application content.

## Storage

- private object storage;
- encrypted transport;
- protected database metadata;
- secret-managed storage credentials;
- no public bucket/object access by default.

## Access

Access requires:

- authenticated actor/workload;
- object-level authorization;
- approved purpose;
- CAP-003 Practitioner authorization for Consultant use.

## URLs

Do not persist permanent public file URLs.

Controlled temporary access should expire.

## Logs

Do not log full report contents, extracted sensitive payloads or signed access URLs unnecessarily.

## Audit Candidates

Potential auditable actions:

- report upload;
- report deletion/archive;
- report view/download;
- Practitioner report access;
- reprocessing;
- administrative correction;
- biomarker validation change.

## Retention

Exact retention periods require approved policy.

Codex/engineering must not invent statutory or clinical retention requirements.
