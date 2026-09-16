# Personal and Health Profile derived-metric audit v1

Formula version: `profile-body-metrics-v1`.

| Metric | Required inputs | Available | Formula approved in product | Policy | UI / authority |
|---|---|---:|---:|---|---|
| Age | DOB | Yes | Yes | Derive on read; DOB persists | Personal Profile / canonical body-metrics utility |
| BMI | height, weight | Yes | Yes | Derive on read | Health Profile / canonical body-metrics utility |
| Waist–hip ratio | waist, hip | Yes | Yes | Derive on read | Health Profile / canonical body-metrics utility |
| Lean body mass | weight, valid body-fat value | Conditional | Yes | Derive on read and retain body-fat provenance | Health Profile / canonical body-metrics utility |
| Calculated body fat | gender, height, waist, neck; hip for female | Conditional | Existing U.S. Navy method retained | Derive only; never overwrite measured value | Health Profile / canonical body-metrics utility |
| Muscle mass value | measurement | Optional | No estimation method approved | Persist entered measurement only | Health Profile / server profile contract |
| Muscle mass category | governed category or entered value | Optional | No derivation method approved | Persist without deriving | Health Profile; `REVIEW_REQUIRED` when unsupported |
| Protein low/high | valid LBM | Conditional | Example supplied, not activated in current canonical nutrition contract | Not activated | Nutrition authority remains unchanged |
| Fat target | weight | Conditional | Example supplied, not activated in current canonical nutrition contract | Not activated | Nutrition authority remains unchanged |
| Carbohydrate target | calories, protein, fat | Conditional | Existing consultant allocation differs from example | Not activated; resolve methodology separately | Existing backend nutrition authority |
| Daily calories | age, sex, height, weight, activity | Conditional | Existing versioned BMR/TDEE service | Existing backend-calculated value | Consultant/Nutrition backend authority |

Dependency graph is acyclic: `DOB → age`; `height + weight → BMI`; `waist + hip → WHR`; `circumferences + gender → body-fat estimate`; `weight + selected body fat → LBM`. Measured/entered body fat has priority over calculated estimates. Missing inputs produce `INSUFFICIENT_DATA`, never zero.

Source priority for body fat is: explicitly measured device/smart-scale value, consultant measurement, manual measurement, approved calculated estimate. A calculated estimate is presentation-only unless deliberately saved with source `CALCULATED`.

Health measurement edits append account-scoped history for changed values. Personal identity and health measurements share the existing authenticated profile route and do not alter onboarding state.
