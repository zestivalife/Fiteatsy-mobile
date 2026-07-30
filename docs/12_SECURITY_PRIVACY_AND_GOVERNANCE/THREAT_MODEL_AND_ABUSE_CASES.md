# Fiteatsy — Threat Model & Abuse Cases

## Priority Threats

### Account Takeover
Attacker obtains OTP/session and accesses health data.

### IDOR / Broken Object Authorization
Authenticated user requests another client's report/profile.

### Practitioner Overreach
Unassigned Practitioner attempts to access a Fiteatsy Client.

### Malicious Upload
User uploads malformed/malicious document.

### Prompt Injection
Report content manipulates AI processing.

### Credential Leakage
Secrets enter Git, logs or mobile bundle.

### Replay
Captured integration/event request is replayed.

### Data Exfiltration
Over-broad APIs return unnecessary health history.

### Environment Mix-up
Staging points to production DB/storage.

### Duplicate/Out-of-Order Sync
Old data overwrites newer client/health state.

## Controls

Threats should map to concrete controls and tests.

Threat modelling is iterative and should be revisited as new capabilities are implemented.
