import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync(new URL('../../backend/src/db/migrations/0071_food_authorisation.sql',import.meta.url),'utf8');
const decisionsMigration=readFileSync(new URL('../../backend/src/db/migrations/0072_food_master_authorisation_decisions.sql',import.meta.url),'utf8');
const service=readFileSync(new URL('../../backend/src/modules/admin/common-food-admin.service.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/admin/admin.routes.ts',import.meta.url),'utf8');
const projection=readFileSync(new URL('../../backend/src/modules/nutrition/food-explorer-projection.repository.ts',import.meta.url),'utf8');

test('food authorisation has exactly three business states and a required category',()=>{
 for(const status of ['PENDING','AUTHORISED','NOT_AUTHORISED'])assert.match(migration,new RegExp(status));
 assert.match(migration,/common_foods_category_required_check/);
 assert.match(migration,/length\(trim\(food_category\)\) > 0/);
});

test('bulk authorisation is atomic, audited and actor-bound',()=>{
 assert.match(service,/food_explorer_search_projection where projection_id=any\(\$1::text\[\]\) for update/);
 assert.match(service,/food_master_authorisation_audit/);
 assert.match(decisionsMigration,/primary key \(source_type, source_record_id\)/);
 assert.match(service,/account\.accountId/);
 assert.match(service,/await client\.query\('commit'\)/);
 assert.match(service,/await client\.query\('rollback'\)/);
 assert.match(routes,/\/food-authorisation\/bulk/);
});

test('recommended projection requires explicit authorisation and preserves source identity matching',()=>{
 assert.match(projection,/authorization_status='AUTHORISED'/);
 assert.match(projection,/source_record_id=any/);
 assert.match(projection,/jsonb_array_elements\(source_trace\)/);
 assert.doesNotMatch(projection,/projection_id=any/);
});
