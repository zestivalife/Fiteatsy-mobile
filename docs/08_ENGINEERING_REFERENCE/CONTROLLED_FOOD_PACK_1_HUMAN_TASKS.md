# Controlled Indian Food Pack 1 — Human task pack

All formulas and quantities are `PROPOSED — REQUIRES NUTRITION REVIEW`; they are review tasks, not canonical recipes or nutrition facts. The exact proposed batch quantities are recorded in `pack-1.pending-review.json`. Stage A must approve or revise them before any cooking. Stage B occurs only after physical measurement and automated calculation.

| Preparation | Ingredients locked | Raw weights needed | Water needed | Oil needed | Final weight needed | Serving measurement | Reviewer |
|---|---:|---:|---:|---:|---:|---|---|
| Chapati | No | Yes | Yes | Yes/zero verified | Yes | Five independent pieces | Nutrition Reviewer |
| Plain Cooked White Rice | No | Yes | Yes | Zero verified | Yes | Three katori fills | Nutrition Reviewer |
| Moong Dal Preparation | No | Yes | Yes | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Tofu Bhurji | No | Yes | Yes/zero verified | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Bhindi Sabji | No | Yes | Yes/zero verified | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Bhindi Aloo | No | Yes | Yes/zero verified | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Peanut Poha | BLOCKED—Poha source | After source approval | Yes | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Upma | BLOCKED—semolina source | After source approval | Yes | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Garlic Bhindi | No | Yes | Yes/zero verified | Yes | Yes | Three katori fills | Nutrition Reviewer |
| Plain Buttermilk | No | Yes | Yes | Zero verified | Yes | Three glass fills | Nutrition Reviewer |

Required data-entry columns: preparation ID, formula revision, ingredient Food Version ID, raw quantity grams, water grams, oil/fat grams, final prepared weight grams, serving label, each serving observation grams, equipment ID, scale resolution grams, operator, measurement date, and notes.

No human nutrition calculation is requested. After approved measurements are entered, the repository calculator generates per-100-g and per-serving nutrition plus a deterministic calculation hash for Stage B review.
