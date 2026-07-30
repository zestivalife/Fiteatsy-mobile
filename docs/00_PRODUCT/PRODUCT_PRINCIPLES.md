# Fiteatsy — Product Principles

**Status:** ACTIVE

## P-01 — Longitudinal Before Snapshot

A single health value has limited meaning without context.

Where possible, Fiteatsy should help users understand change over time.

## P-02 — Provenance Matters

Health observations must retain enough provenance to distinguish:

- measured data;
- user-entered data;
- report-derived data;
- calculated data;
- practitioner-entered data;
- AI-generated explanation.

These must not be silently mixed.

## P-03 — Freshness Must Be Visible

The latest displayed value is not necessarily a live value.

Where clinically or operationally relevant, expose when data was measured and last synchronised.

## P-04 — User Data Requires Purpose

Collect health information because a defined Fiteatsy capability requires it, not merely because a provider exposes it.

## P-05 — Practitioner Access Is Explicit

A practitioner sees a client's Fiteatsy information only through governed authorization.

CAP-003 remains the platform authority for Practitioner Assignment.

## P-06 — Fiteatsy Owns Fiteatsy Health State

The Consultant system may consume projections and authorised health context, but it does not become the source of truth for Fiteatsy-owned health data.

## P-07 — Intervention Must Close the Loop

Practitioner plans should not be disconnected documents.

The product direction is to connect intervention with subsequent measurable health/progress signals.

## P-08 — AI Explains; Evidence Determines

AI may assist with summarisation, explanation and user-friendly presentation under appropriate governance.

AI must not fabricate source observations or independently establish clinical truth.

## P-09 — Design for Heterogeneous Sources

Different devices, apps and reports provide different metrics, units, frequencies and quality.

Fiteatsy must normalise rather than assume uniform inputs.

## P-10 — Safety Over Engagement

Do not optimise engagement by overstating health improvement, urgency, diagnosis or recovery.

## P-11 — Minimal Replication

Cross-system integration should move the minimum information required for the receiving capability.

## P-12 — Architecture Can Evolve

Capability boundaries should be stable even when implementation moves from a modular backend to independent services.
