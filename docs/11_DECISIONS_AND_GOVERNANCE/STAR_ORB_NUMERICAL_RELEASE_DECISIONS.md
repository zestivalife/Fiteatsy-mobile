# Star Orb numerical release decision register

Status: candidate-only. This register does not activate production scoring.

| Decision | Current candidate rule | Evidence and assumption | Missing validation / approval |
|---|---|---|---|
| AB-01 | 14 daily goal-attainment loads compared with 7 rest days; Activity uses 20% | Product-defined wellness balance | Clinical/product approval of interpretation and thresholds |
| Sleep | Duration 40%, quality 40%, consistency 20%; seven wake-day nights | HealthKit stages, local wake-day attribution | Threshold and clinical interpretation approval |
| HRV | Current same-type SDNN or RMSSD versus prior 28 days; minimum 14 | Personal-baseline comparison; no type mixing or look-ahead | Normalisation slope approval |
| Stress | Inverted PSS-10 range | PSS-10 is present with instrument/scoring version | Confirm administration cadence/licensing; it is not a wellbeing instrument |
| Wellbeing / Mind | Mood 40%, validated wellbeing 35%, completed sessions 15%, pattern 10% | Mood and sessions exist | No licensed validated wellbeing instrument exists; Mind stays unavailable |
| Food quality | Proposal: verified consumed-food diversity, fibre and added sugar only | Canonical consumption data can support these dimensions | Nutrition/product approval; incomplete logs remain unknown |
| Clinical markers | A: strict 25% marker dependency. B: separately labelled everyday proposal | No favourable default when labs are absent | Product must choose A/B; marker-specific clinical methodology required |
| Body Recovery | Sleep 40%, HRV 30%, resting HR 30% | Same-type personal baselines | Clinical validation of weights/slopes |
| Lifestyle Balance | Sleep behaviour 40%, activity distribution 35%, mindfulness 15%, explicit habits 10% | Independent lifestyle inputs | Product approval and circularity review |
| Composite Recovery | Sleep 40%, Body 30%, Activity Balance 20%, Lifestyle 10% | Recovery reads independent children, never Overall | Final methodology/clinical review |

Persisted numeric goals use explicit source, status, approval, effective dates and immutable revisions. User writes are supported. Consultant writes are deliberately not exposed until an existing Consultant permission contract is identified that explicitly authorises changing wellness goals.

Completed breathing, focus and movement sessions reuse the durable health-event queue. Only events with `status=completed`, a positive `durationMinutes`, an explicit category, timestamp and health day enter candidate scoring. Replay keys provide deduplication.

The food-quality and Option-B calculations are isolated proposals and are not connected to the runtime loader. PSS-10 remains a Calm stress input only. Candidate endpoints remain development-gated and production scoring is unchanged.
