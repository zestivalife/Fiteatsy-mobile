import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path:string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('generation exposes a larger candidate pool separately from five approved recommendations', () => {
  const service = read('../../backend/src/modules/nutrition/common-food-consultant.service.ts');
  assert.match(service, /recommendedOptionIds:selected\.options\.map/);
  assert.match(service, /\.slice\(0,12\)/);
  assert.match(service, /options:pool/);
  assert.match(service, /available:pool\.length/);
});

test('common-food selection mapping is the only editable authoring authority', () => {
  const repository = read('../../backend/src/modules/nutrition/common-food-consultant.repository.ts');
  assert.match(repository, /diet_plan_option_selections/);
  assert.match(repository, /authoring_mode.*<>'COMMON_FOOD'/s);
  assert.match(repository, /'\"COMMON_FOOD\"'::jsonb/);
  assert.match(repository, /COMMON_FOOD_SELECTION_INCOMPLETE/);
});

test('review freeze remains exact and immutable at seven meals by five selections', () => {
  const repository = read('../../backend/src/modules/nutrition/common-food-consultant.repository.ts');
  assert.match(repository, /options\.length!==35/);
  assert.match(repository, /counts\.size!==7/);
  assert.match(repository, /count!==5/);
  assert.match(repository, /common_food_options=\$3::jsonb/);
});
