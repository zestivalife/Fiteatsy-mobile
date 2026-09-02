# FITEATSY-FOOD-KNOWLEDGE-CONTRACT-v1

Status: candidate foundation. Production population and product cutover are not authorised.

## Canonical model

`nutrition_foods` remains the stable canonical Food identity. `food_knowledge_food_profiles` adds a stable canonical code, Family, factual Food type, client-consumable boundary, retirement, and supersession. A materially different preparation is a different Food. A factual correction to the same preparation creates a new immutable `food_knowledge_versions` row.

Serving size never creates another Food. Generated client meal compositions never create canonical Foods. Ingredient-only records can exist for composition but cannot be client-consumable or Diet eligible.

## Factual integrity

Relational nutrient definitions permit macros and new micronutrients without schema changes. Unknown nutrition is represented by absence of a verified row, never zero. Client-consumable Diet-eligible versions require verified core Energy, Protein, Carbohydrate, Fat, Fibre, a practical canonical serving, meal suitability, and approved provenance.

Prepared Foods expose structured components. Bhindi Sabji does not contain Potato; Bhindi Aloo is a separate Food and does. Component queries, not name matching, enforce Potato, Onion, and Garlic exclusions. Composition self-reference is database-blocked; the validator blocks cycles and projections flatten only to a governed depth.

## Taxonomy and compatibility

Food Families, hierarchical Cuisines, meal suitability, diet patterns, preparation profiles, allergens, and contextual tags are relational many-to-many facts. Jain is a preparation profile, not a Cuisine. `PRESENT`, `ABSENT_VERIFIED`, and `UNKNOWN` allergen states remain distinct; unknown is fail-closed for safety filtering.

Allergy, intolerance, explicit avoid, dislike, and preference remain different client-context semantics. Client preferences never live on shared Food Knowledge records.

## Provenance, licence, and release

Every Food Version maps to an explicit source/version/licence record. `REFERENCE_ONLY`, `SHARE_ALIKE_REVIEW`, and `UNKNOWN_BLOCKED` sources cannot support production eligibility. Direct and calculated nutrition must retain their real provenance; calculated nutrition requires a versioned methodology.

Releases have a deterministic SHA-256 manifest identity, predecessor link, immutable membership, and transactional fail-closed import. Re-importing the same release writes nothing. Reusing a release version with another hash, canonical identity collisions, same-version content drift, or provenance/licence drift blocks import.

## Projection and consumers

`food_knowledge_generation_projection` is derived from canonical tables and release-addressed. Internal queries push down production eligibility, consumability, meal, diet, preparation, composition, allergen, Cuisine hierarchy, and context filters before limiting results. Coverage counts distinct Food, Family, Version, and Serving identities separately.

Food Knowledge answers what a Food is. It does not decide what a client should eat. Diet Plan, Eating Out, Craving, What Can I Eat Now, Consumption, and Clinical Nutrition remain on their current production paths until separately approved cutovers.

## Frozen compatibility

Catalogue v1.1, Diet Versions, consumption history, Biomarker projection, Food Preference ownership, calorie/macro allocation, Consultant review, DOCX, and mobile Nutrition behaviour remain unchanged.
