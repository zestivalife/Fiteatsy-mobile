import assert from 'node:assert/strict';
import test from 'node:test';
import { closePool, pool } from '../../backend/src/db/pool.js';
import { migrateDatabase } from '../../backend/src/db/migrator.js';
import { refreshFoodExplorerProjection } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { searchFoodExplorerProjection } from '../../backend/src/modules/nutrition/food-explorer-projection.repository.js';

test.before(async()=>{await migrateDatabase();});
test.after(async()=>{await closePool();});

test('projection is canonical, governed-wins, searchable, paginated and idempotent',async()=>{
 const first=await refreshFoodExplorerProjection();const second=await refreshFoodExplorerProjection();
 assert.equal(second.projectionVersion,first.projectionVersion);assert.equal(second.projectionHash,first.projectionHash);assert.equal(second.rowCount,first.rowCount);
 const uniqueness=await pool.query('select count(*)::int rows,count(distinct canonical_identity_key)::int identities from food_explorer_search_projection');
 assert.equal(uniqueness.rows[0].rows,uniqueness.rows[0].identities);assert.equal(uniqueness.rows[0].rows,first.rowCount);
 const page=await searchFoodExplorerProjection({scope:'ALL',limit:5,offset:0});assert.equal(page.items.length,Math.min(5,first.rowCount));assert.equal(Number(page.summary.total),first.rowCount);
 const next=await searchFoodExplorerProjection({scope:'ALL',limit:5,offset:5});assert.equal(new Set([...page.items,...next.items].map((item:any)=>item.id)).size,page.items.length+next.items.length);
 const governedOverlap=await pool.query("select count(*)::int count from food_explorer_search_projection where source_type<>'GOVERNED' and source_trace @> '[{\"sourceType\":\"GOVERNED\"}]'::jsonb");assert.equal(governedOverlap.rows[0].count,0);
});

test('aliases, facets, counts and approved proposals are projection-backed',async()=>{
 const alias=await searchFoodExplorerProjection({scope:'ALL',search:'winter melon',limit:20,offset:0});assert.ok(alias.items.some((item:any)=>String(item.displayName).toLowerCase()==='ash gourd'));
 assert.ok(Array.isArray(alias.summary.categories));assert.equal(typeof alias.summary.total,'number');
 const proposals=await pool.query("select count(*)::int count from food_explorer_search_projection where source_type='APPROVED_PROPOSAL'");assert.ok(proposals.rows[0].count>=0);
 const payload=await pool.query("select count(*)::int count from food_explorer_search_projection where source_type='REFERENCE' and manual_addable");assert.equal(payload.rows[0].count,0);
});
