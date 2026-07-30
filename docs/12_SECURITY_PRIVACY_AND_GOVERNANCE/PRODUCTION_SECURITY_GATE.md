# Fiteatsy — Production Security Gate

## No Production Acceptance Until

### Identity & Authentication
- demo/local auth bypass removed;
- production OTP/session flow verified;
- logout/revocation verified;
- session restoration tested.

### Authorization
- object ownership tests pass;
- cross-user access denied;
- Practitioner access depends on CAP-003 where applicable.

### Database
- production database isolated;
- migrations verified;
- backups/recovery capability understood.

### Secrets
- no known committed active secrets;
- production credentials stored securely;
- mobile bundle reviewed for server secrets.

### Health Data
- sensitive logging reviewed;
- permissions are appropriately scoped;
- data provenance retained.

### Reports
Before report launch:
- private durable storage;
- controlled access;
- upload validation;
- processing isolation.

### Integration
Before Consultant integration:
- machine-to-machine authentication;
- authorization;
- replay/idempotency controls;
- audit/reconciliation.

### AI
Before AI production use:
- approved provider/use;
- data minimisation;
- output validation;
- prompt-injection boundary;
- model/version provenance where required.

## Evidence

Security acceptance must cite test/runtime evidence rather than checklist assertions alone.
