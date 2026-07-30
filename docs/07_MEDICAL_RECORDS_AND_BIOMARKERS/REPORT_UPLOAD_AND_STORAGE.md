# Fiteatsy — Report Upload & Storage

## Storage Model

```text
PostgreSQL
  -> report identity
  -> client ownership
  -> file metadata
  -> lifecycle/status
  -> processing metadata
  -> storage reference

Private Object Storage
  -> original PDF/image/document
```

## Upload Flow

Preferred target pattern:

```text
Authenticated Mobile
      |
      v
Create Upload Intent
      |
      v
Backend Authorises Client
      |
      v
Short-Lived Controlled Upload
      |
      v
Private Object Storage
      |
      v
Upload Confirmation
      |
      v
Report Record -> STORED
      |
      v
Processing Job
```

Exact storage technology is not frozen.

## Required Controls

A report upload should validate, as appropriate:

- authenticated ownership;
- allowed content type;
- file-size limits;
- file integrity;
- malware/content scanning strategy where required;
- duplicate-upload strategy;
- upload completion.

## Object Access

Objects must be private by default.

Do not store permanent public URLs.

Download/view access should use authenticated proxying or controlled short-lived access.

## Original Preservation

The original uploaded artifact should be preserved according to approved retention policy even if extraction fails.

## Integrity

A cryptographic content hash may be used to support integrity/deduplication, but hash-based duplicate detection must not automatically delete a report without product rules.
