# Common Food Ranking V2

`COMMON_FOOD_RANKING_V2` is deterministic product-ranking logic. It is not a clinical score and does not make health claims.

Safety, source eligibility and meal-role eligibility remain hard gates. The existing calorie/protein fit score remains authoritative. V2 then adds relative ranking signals:

- preferred vegetable-role classes receive a small positive weight;
- known fibre contributes up to four points; unknown fibre contributes no claim and remains `null`;
- each additional major starch in one combination costs twelve points;
- an ingredient used once earlier in the generated day costs five points, twice costs fourteen, and three-or-more times costs thirty;
- a previously used vegetable family costs three points per prior use, capped at eight.

These weights exist to break otherwise-comparable ranking ties toward vegetable variety and away from repeated potato/starch stacking. They never turn an eligible food into a hidden manual-selection prohibition. When supply is limited, safe starchy options remain available and shortages remain truthful.

## Active vegetable mapping

| Canonical food | Vegetable class | Family | Starch class |
|---|---|---|---|
| grape-tomato | OTHER_VEGETABLE | grape tomato | NON_STARCHY |
| broccoli-raw | CRUCIFEROUS | CRUCIFEROUS | NON_STARCHY |
| onion | OTHER_VEGETABLE | onion | NON_STARCHY |
| spinach | LEAFY_GREEN | LEAFY_GREEN | NON_STARCHY |
| roma-tomato | OTHER_VEGETABLE | roma tomato | NON_STARCHY |
| carrot | ROOT_VEGETABLE | ROOT_VEGETABLE | MODERATE_STARCH |
| green-beans | LEGUME_VEGETABLE | LEGUME_VEGETABLE | MODERATE_STARCH |
| potato | STARCHY_VEGETABLE | POTATO | STARCHY |
| sweet-potato | STARCHY_VEGETABLE | POTATO | STARCHY |
| cabbage | CRUCIFEROUS | CRUCIFEROUS | NON_STARCHY |
| cauliflower | CRUCIFEROUS | CRUCIFEROUS | NON_STARCHY |
| pumpkin | GOURD | GOURD | NON_STARCHY |
| cucumber | OTHER_VEGETABLE | cucumber | NON_STARCHY |
| eggplant | OTHER_VEGETABLE | eggplant | NON_STARCHY |
| okra | NON_STARCHY_VEGETABLE | OKRA | NON_STARCHY |

Ranking affects newly generated candidate order only. Persisted historical selections are not rewritten.
