# Biomarker clinical semantics and diet effect matrix

Clinical interpretation authority: `backend/src/modules/biomarkers/biomarker-clinical-semantics.ts`

Calculation version: `FIT-BIOMARKER-CLINICAL.v1`

The authority derives `LOW`, `NORMAL`, `HIGH`, or `UNKNOWN` from a structurally
validated numeric observation and that observation's own reference interval.
Unsupported, missing, or non-numeric reference semantics resolve to `UNKNOWN`.
Validation status, clinical status, and comparison status are separate fields.

| Canonical marker | Normal | Low | High | Unknown | Diet narrative effect | Candidate filtering | Safety effect |
|---|---|---|---|---|---|---|---|
| Vitamin B12 | No marker-specific guidance | Cautious B12-supportive food guidance, Consultant review required | No automated rule | Informational only | Low only | None | No supplement, injection, or medication direction |
| Vitamin D | No marker-specific guidance | Cautious vitamin-D supportive focus | No automated rule | Informational only | Low only | None | No supplement or dose direction |
| HbA1c | No glycaemic warning | No automated rule | Cautious carbohydrate-distribution guidance, Consultant review required | Informational only | High only | None | No diagnosis or medication direction |
| Fasting glucose | No glycaemic warning | No automated rule | Cautious carbohydrate-distribution guidance, Consultant review required | Informational only | High only | None | No diagnosis or medication direction |
| LDL / triglycerides | No lipid warning | No automated rule | Consultant review context only; no governed food rule exists | Informational only | None | None | No automatic fat, egg, or fish restriction |
| Haemoglobin | No anaemia narrative | Consultant review context only; no governed food rule exists | Consultant review context only; no governed food rule exists | Informational only | None | None | No diagnosis or supplement direction |
| Creatinine / eGFR | No renal narrative | Clinical review required | Clinical review required | Informational only | No automated renal narrative | None | No automated renal food restriction |
| Major liver markers | No hepatic narrative | Clinical review required | Clinical review required | Informational only | No automated hepatic narrative | None | No automated hepatic food restriction |

Biomarkers do not change calorie, macro, or meal targets. They do not include or
exclude food candidates. A new report updates intelligence available for Consultant
review but never mutates or republishes an existing diet plan. Medication-food
interaction rules are not implemented and must not be claimed.

Every actionable intelligence source uses the canonical biomarker ID and source
report ID. Consultant report details use report-associated observations, while the
latest-marker summary remains a separate projection.
