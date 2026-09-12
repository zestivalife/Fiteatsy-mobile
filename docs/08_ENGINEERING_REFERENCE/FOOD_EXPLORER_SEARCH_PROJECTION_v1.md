# Food Explorer search projection v1

`food_explorer_search_projection` is a read-only search/index projection. It does not own nutrition, governance, or canonical food truth.

The controlled refresh command reads the immutable governed application catalogue plus active reference and approved-proposal records, applies the existing preparation-aware canonicalisation, consolidates overlaps with `GOVERNED > REFERENCE > APPROVED_PROPOSAL` priority, and atomically replaces the projection in one transaction. Aliases and source trace are retained on the winning identity. A release row records the deterministic content hash, version, row count, and winning-source counts. Repeating a refresh with unchanged sources produces the same logical projection version and rows.

Normal Explorer requests never rebuild the projection. They require an active release, then execute database-side filtering, ordering, pagination, exact count, and facets. Page and aggregate queries run concurrently and transfer only the requested page plus aggregate metadata. The GIN trigram index supports canonical, partial, and alias search; B-tree and GIN indexes support stable pagination, categories, status, roles, and meal metadata.

Refresh is a release operation and must run after migrations whenever governed assets change, and after reference imports, alias approval, proposal approval/deactivation, or eligibility changes. Failure is transactional: the previous projection remains intact. If no release exists, Explorer fails explicitly with `FOOD_EXPLORER_PROJECTION_UNAVAILABLE` rather than rebuilding on a user request.
