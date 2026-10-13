import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildExternalDietFoodContext } from '../../backend/src/modules/external-clients/external-diet-plans.repository.js';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { generateMealCombinations, MEAL_HEADS } from '../../backend/src/modules/nutrition/common-food-engine.js';
import { generateExternalDietPlanDocument, readGeneratedDietPlanDocumentXml } from '../../backend/src/modules/nutrition/nutrition.document.js';

const migration=readFileSync(new URL('../../backend/src/db/migrations/0095_external_diet_plan_self_publish.sql',import.meta.url),'utf8');
const repository=readFileSync(new URL('../../backend/src/modules/external-clients/external-diet-plans.repository.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');

test('external diet plans remain tenant/client scoped and versioned',()=>{assert.match(migration,/tenant_id uuid not null/);assert.match(migration,/foreign key \(client_id, tenant_id\)/);assert.match(migration,/unique \(plan_id, version\)/);assert.match(migration,/external_diet_plan_one_published_version/);});
test('authority excludes the frozen internal tenant and requires owner or consultant without intake gates',()=>{assert.match(repository,/tenantType==='ZESTIVA_INTERNAL'/);assert.match(repository,/OWNER','CONSULTANT/);assert.doesNotMatch(repository,/CLIENT_INTAKE_REQUIRED/);assert.doesNotMatch(repository,/CONSENT_REQUIRED/);});
test('generation reuses governed Common Food and enforces seven heads with five options',()=>{assert.match(repository,/commonFoodCatalogue/);assert.match(repository,/generateMealCombinations/);assert.match(repository,/MEAL_HEADS\.map/);assert.match(repository,/generated\.options\.length<5/);assert.match(repository,/count!==35/);});
test('Jain and legacy string intake values normalize deterministically',()=>{const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:['JAIN'],breakfast:'Poha',lunch:['Dal rice']},allergiesFamilyHistory:{foodAllergies:['PEANUT']}});assert.equal(context.diet,'VEGETARIAN');assert.deepEqual(context.preferences,['Poha','Dal rice']);assert.ok(context.avoids.includes('ONION'));assert.ok(context.avoids.includes('GARLIC'));assert.deepEqual(context.allergies,['PEANUT']);});
test('external publish path is direct and does not invoke Senior review',()=>{assert.match(routes,/diet-plan\/publish/);assert.match(repository,/status='PUBLISHED'/);assert.doesNotMatch(repository,/senior|reviewer|submitted_for_review/i);});

test('external generation returns real shared canonical foods and governed nutrition snapshots',()=>{
  const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:[],intolerances:[]},allergiesFamilyHistory:{foodAllergies:[]}});
  const ratios=[.06,.18,.08,.28,.1,.24,.06];
  const proteinRatios=[.04,.18,.08,.3,.1,.24,.06];
  const options=MEAL_HEADS.flatMap((mealHead,index)=>generateMealCombinations({
    foods:commonFoodCatalogue,
    context,
    mealHead,
    target:{kcal:2100*ratios[index],protein:120*proteinRatios[index],kcalTolerance:105,proteinTolerance:5},
    limit:5,
    semanticV1:true
  }).options);
  const sharedIds=new Set(commonFoodCatalogue.map(food=>food.id));
  assert.equal(options.length,35);
  assert.ok(options.every(option=>option.clientTitle&&option.clientTitle!=='Governed food option'));
  assert.ok(options.every(option=>option.components.length>0&&option.components.every(component=>sharedIds.has(component.foodId))));
  assert.ok(options.every(option=>option.nutrition.kcal!==null&&option.nutrition.kcal>0));
  assert.equal(options.filter(option=>option.components.some(component=>!sharedIds.has(component.foodId))).length,0);
});

test('external food context passes governed diet and safety exclusions into the shared generator',()=>{
  const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:['JAIN','NO_ONION_GARLIC'],intolerances:['DAIRY']},allergiesFamilyHistory:{foodAllergies:['PEANUTS']}});
  assert.equal(context.diet,'VEGETARIAN');
  assert.deepEqual(context.allergies,['PEANUTS']);
  assert.deepEqual(context.intolerances,['DAIRY']);
  for(const exclusion of ['JAIN','NO_ONION_GARLIC','ONION','GARLIC','ROOT_VEGETABLE'])assert.ok(context.avoids.includes(exclusion));
});

test('missing diet and allergy answers are explicit and use external-only safe catalogue context',()=>{
  const context=buildExternalDietFoodContext({nutrition:{}}) as any;
  assert.equal(context.diet,'VEGAN');
  assert.equal(context.dietPreferenceProvided,false);
  assert.equal(context.allergyInformationProvided,false);
  assert.ok(context.warnings.includes('DIET_PREFERENCE_NOT_PROVIDED_SAFE_VEGAN_CATALOGUE'));
  assert.ok(context.warnings.includes('ALLERGY_INFORMATION_NOT_PROVIDED'));
});

test('external DOCX reuses the canonical seven-meal diet-chart template with exact governed options',async()=>{
  const context=buildExternalDietFoodContext({nutrition:{dietPreference:'VEGETARIAN',restrictions:[],intolerances:[]},allergiesFamilyHistory:{foodAllergies:[]}});
  const ratios=[.06,.18,.08,.28,.1,.24,.06];
  const proteinRatios=[.04,.18,.08,.3,.1,.24,.06];
  const meals=MEAL_HEADS.map((mealHead,index)=>({mealHead,options:generateMealCombinations({foods:commonFoodCatalogue,context,mealHead,target:{kcal:2100*ratios[index],protein:120*proteinRatios[index],kcalTolerance:105,proteinTolerance:5},limit:5,semanticV1:true}).options}));
  assert.ok(meals.every(meal=>meal.options.length===5));
  const document=await generateExternalDietPlanDocument({
    client:{display_name:'Governed QA Client',date_of_birth:'1990-01-01',gender:'FEMALE',sections:{goals:{primaryGoal:'Sustainable fat loss'},nutrition:{dietPreference:'VEGETARIAN',regionalCuisine:'Maharashtrian'},allergiesFamilyHistory:{foodAllergies:[]}}},
    practiceName:'Governed QA Practice',
    preparedBy:'QA External Consultant',
    plan:{created_at:'2026-10-10T00:00:00.000Z'},
    version:{version:3,created_at:'2026-10-10T00:00:00.000Z',plan_snapshot:{dailyTargets:{calories:2100,protein:120},meals}},
  });
  assert.ok(document.buffer.length>10000);
  assert.match(document.filename,/governed-qa-client_Diet_Plan_2026-10-10\.docx/);
  const outputDirectory=await mkdtemp(path.join(os.tmpdir(),'external-diet-docx-'));
  const outputPath=path.join(outputDirectory,document.filename);
  await writeFile(outputPath,document.buffer);
  const xml=await readGeneratedDietPlanDocumentXml(outputPath);
  assert.doesNotMatch(xml,/\{\{[a-z0-9_]+\}\}/i);
  assert.match(xml,/Governed QA Client/);
  assert.match(xml,/Governed QA Practice/);
  assert.match(xml,/QA External Consultant/);
  for(const meal of meals)for(const option of meal.options)assert.match(xml,new RegExp(option.clientTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(xml,/Senior Consultant|submitted for review/i);
  await rm(outputDirectory,{recursive:true,force:true});
});
