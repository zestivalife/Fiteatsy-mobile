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

test('GST is limited to the two wellness subscription plans', () => {
  assert.equal(calculateGstForPlan('WELLNESS_TRACKING_6M', 299900).totalAmountMinor, 353882);
  assert.equal(calculateGstForPlan('WELLNESS_TRACKING_12M', 499900).totalAmountMinor, 589882);
  assert.equal(calculateGstForPlan('LIFESTYLE_MODIFICATION_CONSULT', 99900).totalAmountMinor, 99900);
});
