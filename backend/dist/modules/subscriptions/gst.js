export const CGST_RATE_PERCENT = 9;
export const SGST_RATE_PERCENT = 9;
const roundMinor = (amountMinor, ratePercent) => Math.round((amountMinor * ratePercent) / 100);
export const calculateGst = (baseAmountMinor) => {
    const cgstAmountMinor = roundMinor(baseAmountMinor, CGST_RATE_PERCENT);
    const sgstAmountMinor = roundMinor(baseAmountMinor, SGST_RATE_PERCENT);
    return {
        baseAmountMinor,
        cgstRatePercent: CGST_RATE_PERCENT,
        cgstAmountMinor,
        sgstRatePercent: SGST_RATE_PERCENT,
        sgstAmountMinor,
        totalTaxMinor: cgstAmountMinor + sgstAmountMinor,
        totalAmountMinor: baseAmountMinor + cgstAmountMinor + sgstAmountMinor
    };
};
export const calculateGstForPlan = (code, baseAmountMinor) => code === 'WELLNESS_TRACKING_6M' || code === 'WELLNESS_TRACKING_12M'
    ? calculateGst(baseAmountMinor)
    : {
        baseAmountMinor,
        cgstRatePercent: 0,
        cgstAmountMinor: 0,
        sgstRatePercent: 0,
        sgstAmountMinor: 0,
        totalTaxMinor: 0,
        totalAmountMinor: baseAmountMinor
    };
