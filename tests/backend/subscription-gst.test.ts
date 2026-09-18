import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGst, calculateGstForPlan } from '../../backend/src/modules/subscriptions/gst.js';

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
