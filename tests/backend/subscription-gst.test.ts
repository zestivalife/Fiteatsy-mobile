import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateGst, calculateGstForPlan } from '../../backend/src/modules/subscriptions/gst.js';

test('canonical one-time consultation migration grants the expert consultation capability', () => {
  const migration = readFileSync(
    new URL('../../backend/src/db/migrations/0080_canonical_six_plan_catalogue.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /plans\.code = 'LIFESTYLE_CONSULT'/);
  assert.match(migration, /registry\.code = 'EXPERT_CONSULTATION'/);
  assert.match(migration, /select versions\.id, registry\.code, true/);
});

test('GST uses exact integer-paise amounts for the 6 month plan', () => {
  assert.deepEqual(calculateGst(299900), {
    baseAmountMinor: 299900,
    cgstRatePercent: 9,
    cgstAmountMinor: 26991,
    sgstRatePercent: 9,
    sgstAmountMinor: 26991,
    totalTaxMinor: 53982,
    totalAmountMinor: 353882
  });
});

test('GST uses exact integer-paise amounts for the 12 month plan', () => {
  assert.deepEqual(calculateGst(499900), {
    baseAmountMinor: 499900,
    cgstRatePercent: 9,
    cgstAmountMinor: 44991,
    sgstRatePercent: 9,
    sgstAmountMinor: 44991,
    totalTaxMinor: 89982,
    totalAmountMinor: 589882
  });
});

test('GST is applied consistently to every canonical purchasable plan', () => {
  assert.equal(calculateGstForPlan('WELLNESS_6M', 299900).totalAmountMinor, 353882);
  assert.equal(calculateGstForPlan('WELLNESS_12M', 499900).totalAmountMinor, 589882);
  assert.equal(calculateGstForPlan('LIFESTYLE_CONSULT', 199900).totalAmountMinor, 235882);
  assert.equal(calculateGstForPlan('CLINICAL_1M', 599900).totalAmountMinor, 707882);
  assert.equal(calculateGstForPlan('CLINICAL_3M', 1499900).totalAmountMinor, 1769882);
  assert.equal(calculateGstForPlan('DEEP_HEALING_6M', 2499900).totalAmountMinor, 2949882);
});
