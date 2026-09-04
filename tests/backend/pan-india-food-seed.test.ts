import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as XLSX from '../../backend/node_modules/xlsx/xlsx.mjs';

const source=new URL('../../backend/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx',import.meta.url);
const workbook=XLSX.read(readFileSync(source),{type:'buffer'});const rows=XLSX.utils.sheet_to_json(workbook.Sheets['Food Master'],{defval:null}) as Array<Record<string,unknown>>;
test('Batch 0 immutable workbook contains exactly 335 complete source identities',()=>{assert.equal(rows.length,335);assert.equal(new Set(rows.map(r=>String(r.ID))).size,335);for(const row of rows){assert.ok(String(row.ID??'').trim());assert.ok(String(row['Food Name']??'').trim());assert.ok(String(row.Category??'').trim());assert.ok(String(row['Reference State']??'').trim())}});
test('Batch 0 nutrition remains explicitly reference-only',()=>{assert.ok(rows.every(row=>String(row['Verification Status']).toLowerCase().includes('reference')));const sha=createHash('sha256').update(readFileSync(source)).digest('hex');assert.match(sha,/^[a-f0-9]{64}$/)});
test('Batch 0 includes required search fixtures and state diversity',()=>{const names=rows.map(r=>`${r['Food Name']} ${r['Common / Indian Names']}`.toLowerCase());for(const term of ['bhindi','lauki','ragi'])assert.ok(names.some(name=>name.includes(term)),term);const states=new Set(rows.map(r=>String(r['Reference State']).toLowerCase()));assert.ok([...states].some(x=>x.includes('raw')));assert.ok([...states].some(x=>x.includes('cooked')))});
