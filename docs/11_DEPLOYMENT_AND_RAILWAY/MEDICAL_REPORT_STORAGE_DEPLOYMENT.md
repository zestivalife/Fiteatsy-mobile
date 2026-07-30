# Fiteatsy — Medical Report Storage Deployment

## Requirement

PostgreSQL is not the intended primary store for report PDF/image binaries.

## Architecture

```text
Fiteatsy API
   |
   +--> PostgreSQL
   |     report metadata
   |
   +--> Private Object Storage
         report binary
```

## Provider

Object-storage provider is not frozen in this document.

Selection criteria include:

- private access;
- signed upload/download support;
- encryption;
- regional/data requirements;
- reliability;
- cost;
- lifecycle/deletion controls;
- SDK/support.

## Railway

Do not assume Railway service ephemeral filesystem is durable medical-record storage.

Uploaded reports must use approved durable storage.

## Security

- no permanent public report URLs;
- short-lived access where required;
- server-side authorization before access;
- storage credentials remain backend-only.
