# Fiteatsy Nutrition Intelligence Frozen Contract

Contract ID: `FITEATSY-NUTRITION-INTELLIGENCE-CONTRACT-v1`

Status: `ARCHITECTURE FREEZE ACTIVE`

Production status: `PRODUCTION FUNCTIONAL ACCEPTANCE PENDING CATALOGUE + ENV-C + REAL CLIENT`

## Canonical architecture

The one canonical chain is:

`Published Diet Plan + nutrition targets + persisted meal events + persisted water events`

`→ backend Nutrition projection/intelligence`

`→ Today's Plan → Balance My Day → Best Choices → Planned vs Actual → My Pattern → Consultant monitoring`

These surfaces are views over the same published plan and actual event history. They must not become separate data silos or calculate competing interpretations locally.

Client behaviour creates actuals and intelligence. It never mutates the published Diet Plan. Only a Consultant can change the plan by creating, reviewing, approving, and publishing a new version.

## Food Preferences contract

Food Preferences are a canonical plan input snapshot.

Hard constraints:

- dietary pattern;
- allergies and intolerances;
- medical restrictions;
- explicitly avoided foods and canonical avoided food IDs;
- dairy avoidance when explicitly selected.

Hard constraints must exclude conflicting catalogue candidates and must be revalidated before review, approval, and publish.

Soft preferences:

- liked and disliked foods;
- cuisine preferences;
- preferred proteins;
- staple preference;
- practicality preferences.

Soft preferences rank verified compatible candidates. They do not silently become medical exclusions. A disliked food may remain available when clinically and practically appropriate; it must rank below suitable preferred choices.

## Clinical and micronutrient intelligence

Biomarker and micronutrient influence must use canonical, reference-aware, unit-safe clinical status and governed rules. Presence alone must never imply abnormality. Unknown or insufficient evidence must not manufacture clinical guidance.

Calories, macros, food candidates, and the published plan must not change merely because a report or behaviour event exists. Any candidate adjustment remains a Consultant-reviewed proposal until a new version is approved and published.

## Verified catalogue and diversity

Plan candidates must come only from the persisted, verified Nutrition catalogue. No generated template, placeholder meal, static example, or in-memory fallback may enter the active plan-selection path.

Candidate selection must:

- apply all hard constraints before ranking;
- use soft preferences only for scoring/ranking;
- prefer distinct canonical food/meal identities across meal heads before reuse;
- return no candidate when no verified compatible catalogue record exists;
- never fabricate availability to make a screen appear complete.

## Canonical meal structure

Every reviewable version contains exactly these seven meal heads:

1. Early Morning
2. Breakfast
3. Mid-Morning Snack
4. Lunch
5. Evening Snack
6. Dinner
7. Bedtime Nutrition

Each head must contain between one and five distinct saved options before submission. Five is a hard maximum, not a target. The Consultant selects from ranked verified candidates; the system must not force a repeated reselection loop.

## Version lifecycle and governance

The frozen lifecycle is:

`Draft → Submitted for Review → Changes Requested (optional) → Resubmitted → Approved → Published`

Rules:

- saving edits affects only the draft/current version;
- Senior Consultant review resolves the exact submitted version;
- self-approval remains prohibited;
- only an approved version is publishable;
- publish must bind `latest_published_version_id` to that exact approved version;
- publishing creates `ACTIVE_PUBLISHED` delivery state;
- draft, pending, approved-but-unpublished, and superseded content is not client meal content;
- revision creates a new governed version and never rewrites the previously published version;
- Optional Guidance V2 remains optional and separately validated.

## Client delivery and consumption

The client receives only the active published version. Today's Plan presents the seven published meal heads and reconciles persisted states: consumed, pending, out of plan, and skipped.

Approved-option logging binds the canonical client, published plan version, meal head, and business date. Out-of-plan food remains explicitly out of plan and is never labelled Consultant-approved. Consumption and water events are immutable actuals/projections separate from plan content.

## Contextual recommendation surfaces

- **What Can I Eat Now / Best Choices:** dynamically ranks only remaining compatible approved options using backend remaining-target intelligence.
- **Balance My Day:** compares actual intake with published targets and ranks remaining approved options from the same backend calculation layer.
- **Eating Out:** general guidance only; it never becomes prescribed plan content. If consumed, it is logged using the canonical substitution/out-of-plan event semantics.
- **Craving:** prefers compatible approved options matching the craving; it does not replace or rewrite the plan.
- **My Pattern:** evidence-based historical intelligence from persisted adherence, consumption, macro, and water data; no static production narratives.
- **Consultant monitoring:** consumes the same canonical backend projections and never maintains separate interpretations.

## Acceptance and catalogue gate

Architecture freeze does not mean production acceptance. Before production acceptance, the exact candidate must prove:

- verified catalogue records are populated with provenance and Nutrition metadata;
- database-backed catalogue selection and persistence in isolated ENV-C;
- the complete Consultant/Senior Consultant lifecycle;
- published client delivery and actual-event reconciliation;
- a legitimate real-client acceptance flow;
- the frozen Client Lifecycle L3 contract.

Current catalogue readiness must be reported from persisted records, never inferred from migrations or examples.

## Anti-reversion and change control

Normal regression must fail if active code reintroduces fallback/placeholder meals, omits Food Preferences, weakens hard exclusions, allows more than five options, omits any canonical meal head, publishes an unapproved version, reviews a different version, combines consumption with plan content, or changes Client Lifecycle/RBAC.

Any future modification to Nutrition selection, clinical/micronutrient influence, plan lifecycle, delivery, consumption intelligence, contextual recommendations, or catalogue eligibility requires explicit product-owner approval, impact analysis against both frozen contracts, database-backed regression, and production runtime acceptance.

Historical implementations are forensic evidence only and are never valid revert targets.
