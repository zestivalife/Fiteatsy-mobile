import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { DietPlanRecord, DietPlanVersionRecord, NutritionPlanContent } from '../platform/platform.types.js';

const TEMPLATE_FILENAME = '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact.docx';
const TEMPLATE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), TEMPLATE_FILENAME);
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'diet-plan-exports');

const ensureString = (value: unknown, fallback = 'Not available') => {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text.length ? text : fallback;
};

const formatNumber = (value: number | null | undefined, suffix = '') => {
  if (value == null || !Number.isFinite(value)) return 'Not available';
  return `${value}${suffix}`.trim();
};

const take = (values: Array<string | null | undefined>, count: number, fallback = 'Not available') => {
  const normalized = values.map((value) => ensureString(value, '')).filter(Boolean);
  return Array.from({ length: count }, (_, index) => normalized[index] || fallback);
};

const flattenMealOptions = (section: NutritionPlanContent['mealPlan'][keyof NutritionPlanContent['mealPlan']]) =>
  section.options.map((option) => {
    return {
      meal: option.meal,
      portion: option.portion,
      prep: option.prepNote || '',
      kcal: `${option.approxKcal} kcal`,
      protein: `${option.proteinGrams} g`,
    };
  });

const mealSectionMap = [
  ['early_morning', 'earlyMorning'],
  ['breakfast', 'breakfast'],
  ['mid_morning', 'midMorningSnack'],
  ['lunch', 'lunch'],
  ['evening_snack', 'eveningSnack'],
  ['dinner', 'dinner'],
  ['bedtime', 'bedtimeNutrition'],
] as const;

const buildTemplateMap = (plan: DietPlanRecord, version: DietPlanVersionRecord) => {
  const content = version.content;
  const snapshot = content.nutritionSnapshot;
  const goals = take(snapshot.goals, 3, 'To be refined with consultant');
  const conditions = take(snapshot.healthConditions, 3, 'None recorded');
  const weeklyTips = take(content.weeklySuccessGuide, 8, 'Keep the plan practical and repeatable this week.');
  const hydration = Array.from({ length: 5 }, (_, index) => {
    const item = content.hydrationRhythm[index];
    return {
      anchor: item?.anchor || 'Daily anchor',
      quantity: item?.quantity || '250 ml',
      note: item?.note || 'Keep hydration steady through the day.',
    };
  });
  const substitutions = Array.from({ length: 5 }, (_, index) => {
    const item = content.smartSubstitutions[index];
    return {
      usual: item?.usualChoice || 'Current choice',
      alternative: item?.alternative || 'Alternative choice',
    };
  });
  const supplements = Array.from({ length: 3 }, (_, index) => {
    const item = content.supplementsAndClinicalNotes[index];
    return {
      supplement: item?.supplement || 'Consultant review only',
      dose: item?.dose || 'As advised',
      timing: item?.timing || 'After consultant review',
      duration: item?.duration || 'To be confirmed',
      note: item?.note || 'No autonomous supplementation. Use only when clinically approved.',
    };
  });

  const tokens: Record<string, string> = {
    client_name: ensureString(snapshot.client),
    programme_name: ensureString(snapshot.programmeName, 'Personalised Nutrition Plan'),
    start_date: new Date(plan.createdAtISO).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    review_date: new Date(version.updatedAtISO).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    dietitian_name: ensureString(snapshot.preparedBy, 'Consultant'),
    credentials: ensureString(snapshot.preparedBy.includes(',') ? snapshot.preparedBy.split(',').slice(1).join(',').trim() : 'Fiteatsy Consultant'),
    version: `v${version.versionNumber}`,
    issue_date: new Date(version.updatedAtISO).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    brand_name: 'Fiteatsy',
    age: formatNumber(snapshot.age),
    gender: ensureString(snapshot.gender),
    goal_1: goals[0],
    goal_2: goals[1],
    goal_3: goals[2],
    condition_1: conditions[0],
    condition_2: conditions[1],
    dietary_style: ensureString(snapshot.dietPreference),
    regional_cuisine: ensureString((version.sourceSnapshot.healthProfile as Record<string, unknown>)?.regionalCuisine),
    allergies_and_exclusions: snapshot.allergies.length ? snapshot.allergies.join(', ') : 'None recorded',
    occupation: ensureString((version.sourceSnapshot.healthProfile as Record<string, unknown>)?.occupation),
    work_pattern: ensureString((version.sourceSnapshot.healthProfile as Record<string, unknown>)?.workMode),
    usual_wake_sleep_time: ensureString((version.sourceSnapshot.healthProfile as Record<string, unknown>)?.wakeTime && (version.sourceSnapshot.healthProfile as Record<string, unknown>)?.sleepTime ? `${(version.sourceSnapshot.healthProfile as Record<string, unknown>).wakeTime} / ${(version.sourceSnapshot.healthProfile as Record<string, unknown>).sleepTime}` : snapshot.lifestyleSummary),
    personalised_plan_focus: ensureString(snapshot.personalisedPlanFocus),
    energy_range: content.dailyTargets.calories != null ? `${content.dailyTargets.calories} kcal/day` : 'Consultant to confirm',
    protein_target: content.dailyTargets.protein != null ? `${content.dailyTargets.protein} g/day` : 'Consultant to confirm',
    hydration_target: content.dailyTargets.hydration != null ? `${content.dailyTargets.hydration} L/day` : 'Consultant to confirm',
    movement_target: ensureString(content.dailyTargets.movement),
    top_three_priorities: goals.filter((goal) => goal !== 'Not available').join(' • ') || 'Build consistency, support recovery, and improve nourishment quality.',
  };

  mealSectionMap.forEach(([tokenPrefix, contentKey]) => {
    const section = content.mealPlan[contentKey];
    const options = flattenMealOptions(section);
    tokens[`${tokenPrefix}_window`] = ensureString(section.window);
    tokens[`${tokenPrefix}_focus`] = ensureString(section.focus);
    options.forEach((option, index) => {
      const slot = index + 1;
      tokens[`${tokenPrefix}_${slot}_meal`] = option.meal;
      tokens[`${tokenPrefix}_${slot}_portion`] = option.portion;
      tokens[`${tokenPrefix}_${slot}_prep`] = option.prep;
      tokens[`${tokenPrefix}_${slot}_kcal`] = option.kcal;
      tokens[`${tokenPrefix}_${slot}_protein`] = option.protein;
    });
  });
  for(const raw of version.commonFoodOptions){const option=raw as Record<string,unknown>;const mealHead=String(option.mealHead??'').toLowerCase();const prefix=mealHead==='mid_morning'?'mid_morning':mealHead==='evening_snack'?'evening_snack':mealHead==='early_morning'?'early_morning':mealHead==='bedtime'?'bedtime':mealHead;const components=Array.isArray(option.components)?option.components as Array<Record<string,unknown>>:[];const index=version.commonFoodOptions.filter((candidate)=>String((candidate as Record<string,unknown>).mealHead)===String(option.mealHead)).indexOf(raw)+1;if(!prefix||index<1||index>5)continue;tokens[`${prefix}_${index}_meal`]=components.map(c=>`${ensureString(c.label,'')} ${ensureString(c.foodDisplayNameSnapshot,'')}`.trim()).join(' + ');tokens[`${prefix}_${index}_portion`]=components.map(c=>ensureString(c.label,'')).join(' • ');const nutrition=option.nutrition as Record<string,unknown>|undefined;tokens[`${prefix}_${index}_kcal`]=`${nutrition?.kcal??'Not available'} kcal`;tokens[`${prefix}_${index}_protein`]=`${nutrition?.protein??'Not available'} g`;}

  hydration.forEach((item, index) => {
    const slot = index + 1;
    tokens[`hydration_${slot}_anchor`] = item.anchor;
    tokens[`hydration_${slot}_quantity`] = item.quantity;
    tokens[`hydration_${slot}_note`] = item.note;
  });

  weeklyTips.forEach((tip, index) => {
    tokens[`weekly_tip_${index + 1}`] = tip;
  });

  substitutions.forEach((item, index) => {
    const slot = index + 1;
    if (slot === 1) {
      tokens.protein_usual = item.usual;
      tokens.protein_alternative = item.alternative;
    }
    if (slot === 2) {
      tokens.cereal_grain_usual = item.usual;
      tokens.cereal_grain_alternative = item.alternative;
    }
    if (slot === 3) {
      tokens.vegetable_usual = item.usual;
      tokens.vegetable_alternative = item.alternative;
    }
    if (slot === 4) {
      tokens.fruit_usual = item.usual;
      tokens.fruit_alternative = item.alternative;
    }
    if (slot === 5) {
      tokens.dairy_equivalent_usual = item.usual;
      tokens.dairy_equivalent_alternative = item.alternative;
    }
  });

  supplements.forEach((item, index) => {
    const slot = index + 1;
    tokens[`supplement_${slot}`] = item.supplement;
    tokens[`supplement_${slot}_dose`] = item.dose;
    tokens[`supplement_${slot}_timing`] = item.timing;
    tokens[`supplement_${slot}_duration`] = item.duration;
    tokens[`supplement_${slot}_note`] = item.note;
  });

  return tokens;
};

const replaceTokens = (input: string, tokenMap: Record<string, string>) => {
  let output = input;
  for (const [key, value] of Object.entries(tokenMap)) {
    output = output.split(`{{${key}}}`).join(value);
  }
  return output;
};

const sanitizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const generateDietPlanDocument = async (plan: DietPlanRecord, version: DietPlanVersionRecord) => {
  const templateBuffer = await fs.readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  const tokenMap = buildTemplateMap(plan, version);
  const xmlTargets = ['word/document.xml', 'word/header1.xml', 'word/footer1.xml'];

  await Promise.all(
    xmlTargets.map(async (target) => {
      const file = zip.file(target);
      if (!file) return;
      const xml = await file.async('string');
      zip.file(target, replaceTokens(xml, tokenMap));
    }),
  );

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const issueDate = new Date(version.updatedAtISO).toISOString().slice(0, 10);
  const filename = `${sanitizeName(version.content.nutritionSnapshot.client || 'client')}_Diet_Plan_${issueDate}.docx`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputPath, outputBuffer);

  return {
    outputPath,
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
};

export const readGeneratedDietPlanDocumentXml = async (documentPath: string) => {
  const zip = await JSZip.loadAsync(await fs.readFile(documentPath));
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('Generated Diet DOCX is missing word/document.xml.');
  return document.async('string');
};
