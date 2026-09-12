begin;

create unique index if not exists food_explorer_projection_source_key_uq
  on food_explorer_search_projection(source_type, source_record_id);

commit;
