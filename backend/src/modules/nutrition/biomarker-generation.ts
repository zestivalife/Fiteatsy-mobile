import type { ConsultantBiomarkerSummary } from '../consultants/consultants.repository.js';
import type { MealComponent, Nutrients } from './common-food-engine.js';

export const BIOMARKER_GENERATION_RULE_VERSION = 'BIOMARKER_GENERATION_RULES_V1' as const;

export type GovernedBiomarkerRule = 'GLUCOSE_PROTEIN_FIBRE_PAIRING';

export type BiomarkerGenerationSnapshot = {
  biomarkerId: string;
  canonicalMarkerName: string;
  value: number;
  unit: string;
  clinicalStatus: ConsultantBiomarkerSummary['clinicalStatus'];
  validationStatus: string;
  testDate: string;
  sourceReportId: string | null;
  freshness: 'DATE_RECORDED_NO_GENERATION_FRESHNESS_POLICY';
  generationRule: GovernedBiomarkerRule | null;
  generationEffect: 'RANKING' | 'ADVISORY_ONLY' | 'NONE';
};

const glucoseMarker = (name: string) => /hba1c|fasting glucose/i.test(name);
const advisoryMarker = (name: string) => /vitamin b12|\bb12\b|vitamin d/i.test(name);

export const resolveBiomarkerGeneration = (biomarkers: ConsultantBiomarkerSummary[]) => {
  const snapshot: BiomarkerGenerationSnapshot[] = biomarkers.map((item) => {
    const governedGlucoseRule = glucoseMarker(item.canonicalMarkerName) && item.clinicalStatus === 'HIGH';
    return {
      biomarkerId: item.biomarkerId,
      canonicalMarkerName: item.canonicalMarkerName,
      value: item.value,
      unit: item.unit,
      clinicalStatus: item.clinicalStatus,
      validationStatus: item.validationStatus,
      testDate: item.testDate,
      sourceReportId: item.sourceReportId,
      freshness: 'DATE_RECORDED_NO_GENERATION_FRESHNESS_POLICY' as const,
      generationRule: governedGlucoseRule ? 'GLUCOSE_PROTEIN_FIBRE_PAIRING' as const : null,
      generationEffect: governedGlucoseRule ? 'RANKING' as const : advisoryMarker(item.canonicalMarkerName) ? 'ADVISORY_ONLY' as const : 'NONE' as const
    };
  });
  return {
    version: BIOMARKER_GENERATION_RULE_VERSION,
    snapshot,
    activeRules: [...new Set(snapshot.flatMap((item) => item.generationRule ? [item.generationRule] : []))]
  };
};

export const scoreGovernedBiomarkerRules = (input: {
  rules?: GovernedBiomarkerRule[];
  components: MealComponent[];
  nutrition: Nutrients;
}) => {
  let adjustment = 0;
  const factors: Record<string, number> = {};
  if (input.rules?.includes('GLUCOSE_PROTEIN_FIBRE_PAIRING')) {
    const hasProtein = (input.nutrition.protein ?? 0) > 0;
    const hasFibre = (input.nutrition.fibre ?? 0) > 0;
    const pairing = hasProtein && hasFibre ? 8 : hasProtein || hasFibre ? 2 : 0;
    adjustment += pairing;
    factors.glucoseProteinFibrePairing = pairing;
  }
  return { adjustment, factors };
};
