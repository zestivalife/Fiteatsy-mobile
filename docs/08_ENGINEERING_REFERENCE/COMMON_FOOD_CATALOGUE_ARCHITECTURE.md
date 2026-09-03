# Common Food Catalogue Architecture

The v15 candidate separates canonical food identity, versioned serving, explicit meal eligibility, component roles, role-based templates, generated combinations, and validated recipes. `common_foods` holds immutable-version identities and canonical per-100-g nutrition; aliases, servings, roles, eligibility, templates, generation audits, and Diet Plan option snapshots are normalized separately. Indian-specific records remain restricted to `INDIA_AUTHORITATIVE` or `INDIA_LOCAL_LAB`; governed generic commodities use `GLOBAL_GENERIC_APPROVED`.

Generated combinations never become canonical foods. Saved options retain exact food, serving, source, generator, ranking, template, and nutrition snapshots.
