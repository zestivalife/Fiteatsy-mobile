# Fiteatsy Data Integrity Release Contract

This contract is a mandatory release gate for changes to authentication, onboarding, client profile, Nutrition, medication, Consultant, or Senior Consultant functionality. Read it before modifying those surfaces.

## Canonical identity

- The authenticated backend account ID is the canonical `userId`.
- Its bound Fiteatsy client ID is the canonical `clientId`.
- Every profile, plan, version, event, cache entry, Consultant view, and Senior Consultant view must resolve through that pair.
- A missing or mismatched binding is an authorization/data-integrity error. It must never be repaired with a guessed identity.

## Canonical data rules

- Production clinical, profile, plan, adherence, medication, and consultant data comes from persisted backend records. Static examples and fabricated defaults are prohibited.
- Client caches must be scoped by canonical user and client identity. Logout and account switching must not expose another user's state.
- Keep the last verified projection during offline, timeout, server, or permission failures. Only an authoritative `NOT_FOUND` may produce a no-data state.
- Loading, no-data, error, and ready are distinct states. A failed request must not display a false empty profile or “plan being prepared.”
- Profile completion and Nutrition readiness are backend projections and must not be independently reinterpreted by each surface.
- `Member Since` comes from the canonical account creation timestamp.

## Nutrition

- The client may display meal content only from the correct client's `ACTIVE_PUBLISHED` version.
- Draft, review-ready, approved-but-unpublished, and archived content is not a client plan.
- Food preferences, delivery lifecycle, and published-plan requests are independent resources; one failing must not erase another valid resource.
- Client behavior creates actuals and intelligence. It never mutates the Consultant-authored plan.

## Cross-surface parity and security

- Client, Consultant, and Senior Consultant must resolve the same user, client, profile, plan, and version identifiers.
- Backend ownership/assignment checks are authoritative. Wrong-client access must be denied.
- QA uses only accounts explicitly classified as `QA_TEST`; QA fixtures contain no real clinical data and must not trigger real care workflows.

## Frozen accepted experience

- Preserve the latest accepted Onboarding V2, including Food Preferences and its transition to Recovery.
- Preserve the finalized cold-launch video splash and official logo assets.
- Do not change accepted typography, spacing, navigation, or product workflows as part of data-integrity work.

## Runtime and release gates

- `FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT` is a required regression suite.
- Test an existing populated user, active published plan, transient network failure, session restore, user switch, cross-user denial, Consultant parity, Senior Consultant parity, and IST business-date semantics.
- Acceptance must use the exact pushed source in a standalone production runtime: Metro off, no localhost JavaScript, and verified build/OTA metadata.
- A release is blocked if any populated user becomes empty, a canonical name becomes a generic fallback, an active plan becomes no-plan, ownership differs across surfaces, the latest onboarding contract disappears, or production runtime parity is unproven.
