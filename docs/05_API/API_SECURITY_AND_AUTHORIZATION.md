# Fiteatsy — API Security & Authorization

## User APIs

Protected user APIs require valid Fiteatsy authentication.

Ownership is derived server-side.

Never trust caller-provided identity as authorization authority.

## Service APIs

Trusted backend integrations require a workload/service identity separate from user authentication.

Exact mechanism remains open until infrastructure design.

Potential mechanisms may include signed service tokens or another managed workload identity pattern.

## CAP-003

Practitioner access is governed by CAP-003.

Fiteatsy subscription, profile, care-case or legacy consultant fields do not grant Consultant access.

## Sensitive Resources

Strong object-level authorization applies to:

- medical reports;
- biomarkers;
- health observations;
- medications;
- progress records;
- health profiles.

## Rate Limiting

Rate controls should be designed according to endpoint risk and workload.

Health batch ingestion and report upload require different limits from ordinary reads.

## Audit

Sensitive professional access and administrative actions should be auditable where required.

## Secrets

Do not expose:

- database credentials;
- provider secrets;
- signing secrets;
- trusted service credentials

to the mobile application.
