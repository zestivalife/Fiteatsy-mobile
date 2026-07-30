# Fiteatsy — Recovery Intelligence Safety & Clinical Guards

## Product Boundary

Fiteatsy supports tracking, management and recovery-oriented health monitoring.

Architecture must not overstate what the data can establish.

## Do Not

- label an arbitrary composite score as clinical truth;
- diagnose disease solely from the Daily Improvement Matrix;
- infer treatment effectiveness from correlation alone;
- prescribe or change medication autonomously;
- hide missing data;
- convert missing observations to zero;
- allow an LLM to fabricate source measurements;
- guarantee disease recovery;
- treat wearable measurements as equivalent to laboratory/clinical measurements where they are not.

## Abnormal Data

Handling abnormal or potentially concerning values requires a separately approved escalation/product policy.

Do not invent emergency thresholds inside generic scoring code.

## Practitioner

Practitioner visibility does not remove the need for methodology transparency.

## User Communication

Derived indicators should be presented as tracking/progress information with appropriate context and limitations.
