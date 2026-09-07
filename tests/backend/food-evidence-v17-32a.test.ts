import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const artifact=JSON.parse(readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/food_evidence_v17_32a_decisions.json',import.meta.url),'utf8')) as {decisionCount:number;decisions:Array<{referenceItemId:string;evidenceDecision:string;generatorEligible?:boolean;componentEligible?:boolean;selectedSource:unknown;processorVersion:string}>};
test('v17.32A evaluates exactly the persisted 185-food blocked cohort',()=>{assert.equal(artifact.decisionCount,185);assert.equal(artifact.decisions.length,185);assert.equal(new Set(artifact.decisions.map(x=>x.referenceItemId)).size,185);assert.ok(artifact.decisions.every(x=>x.processorVersion==='FOOD_EVIDENCE_V17_32A'&&x.evidenceDecision))});
test('v17.32A is evidence-only and cannot activate runtime foods',()=>{assert.ok(artifact.decisions.every(x=>x.generatorEligible!==true&&x.componentEligible!==true));assert.ok(artifact.decisions.every(x=>x.evidenceDecision!=='READY_FOR_ACTIVATION'));});
