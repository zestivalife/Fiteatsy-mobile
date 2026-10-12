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

const xmlSafe = (value: unknown, fallback = 'Not available') => ensureString(value, fallback)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const externalMealPresentation: Record<string, { prefix: string; window: string; focus: string }> = {
  EARLY_MORNING: { prefix: 'early_morning', window: '6:00–7:30 AM', focus: 'Gentle metabolic wake-up' },
  BREAKFAST: { prefix: 'breakfast', window: '8:00–9:30 AM', focus: 'Protein-first breakfast' },
  MID_MORNING: { prefix: 'mid_morning', window: '11:00–11:30 AM', focus: 'Steady energy between meals' },
  LUNCH: { prefix: 'lunch', window: '1:00–2:30 PM', focus: 'Balanced lunch plate' },
  EVENING_SNACK: { prefix: 'evening_snack', window: '4:30–5:30 PM', focus: 'Prevent cravings and energy dips' },
  DINNER: { prefix: 'dinner', window: '7:30–9:00 PM', focus: 'Lighter dinner for recovery' },
  BEDTIME: { prefix: 'bedtime', window: '9:30–10:30 PM', focus: 'Support sleep and overnight satiety' },
};

const externalList = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  : typeof value === 'string' && value.trim() ? [value.trim()] : [];

const externalAge = (dateOfBirth: unknown) => {
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return 'Not available';
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 ? String(age) : 'Not available';
};

export type ExternalDietPlanDocumentInput = {
  client: Record<string, unknown>;
  practiceName: string;
  preparedBy: string;
  plan: Record<string, unknown>;
  version: Record<string, unknown>;
};

export const generateExternalDietPlanDocument = async (input: ExternalDietPlanDocumentInput) => {
  const templateBuffer = await fs.readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  const sections = (input.client.sections || {}) as Record<string, any>;
  const about = sections.aboutYou || {};
  const goalsSection = sections.goals || {};
  const nutrition = sections.nutrition || {};
  const medical = sections.medicalHistory || {};
  const allergy = sections.allergiesFamilyHistory || {};
  const lifestyle = sections.lifestyle || sections.sleepStressActivity || {};
  const snapshot = (input.version.plan_snapshot || input.version.plan || {}) as Record<string, any>;
  const goals = externalList(goalsSection.goals || goalsSection.primaryGoal);
  const conditions = externalList(medical.conditions || medical.diagnosedConditions);
  const restrictions = [...externalList(nutrition.restrictions), ...externalList(allergy.foodAllergies), ...externalList(nutrition.intolerances)];
  const now = new Date(typeof input.version.published_at === 'string' ? input.version.published_at : typeof input.version.created_at === 'string' ? input.version.created_at : Date.now());
  const created = new Date(typeof input.plan.created_at === 'string' ? input.plan.created_at : now);
  const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const tokenMap: Record<string, string> = {
    client_name: xmlSafe(input.client.display_name || `${about.firstName || ''} ${about.lastName || ''}`.trim()),
    programme_name: 'Personalised Nutrition Plan',
    start_date: formatDate(created), review_date: formatDate(now), issue_date: formatDate(now),
    dietitian_name: xmlSafe(input.preparedBy, 'External Consultant'), credentials: 'External Consultant',
    version: `v${Number(input.version.version || 1)}`, brand_name: xmlSafe(input.practiceName, 'Consultant Practice'),
    age: externalAge(input.client.date_of_birth || about.dateOfBirth), gender: xmlSafe(input.client.gender || about.gender),
    goal_1: xmlSafe(goals[0], 'To be refined with consultant'), goal_2: xmlSafe(goals[1], 'Not recorded'), goal_3: xmlSafe(goals[2], 'Not recorded'),
    condition_1: xmlSafe(conditions[0], 'None recorded'), condition_2: xmlSafe(conditions[1], 'None recorded'),
    dietary_style: xmlSafe(nutrition.dietPreference), regional_cuisine: xmlSafe(nutrition.regionalCuisine || nutrition.cuisinePreference),
    allergies_and_exclusions: xmlSafe(restrictions.length ? restrictions.join(', ') : 'None recorded'),
    occupation: xmlSafe(about.occupation || sections.workRoutine?.occupation), work_pattern: xmlSafe(sections.workRoutine?.workMode),
    usual_wake_sleep_time: xmlSafe(lifestyle.wakeTime && lifestyle.sleepTime ? `${lifestyle.wakeTime} / ${lifestyle.sleepTime}` : 'Not recorded'),
    personalised_plan_focus: xmlSafe(goalsSection.primaryGoal || goals[0], 'Nutrition consistency'),
    energy_range: snapshot.dailyTargets?.calories != null ? String(snapshot.dailyTargets.calories) : 'Consultant to confirm',
    protein_target: snapshot.dailyTargets?.protein != null ? String(snapshot.dailyTargets.protein) : 'Consultant to confirm',
    hydration_target: xmlSafe(nutrition.hydrationTarget || lifestyle.hydrationTarget, 'Consultant to confirm').replace(/\s*(?:l|litres?|liters?)\s*(?:\/day)?$/i, ''),
    movement_target: xmlSafe(lifestyle.activity || lifestyle.activityLevel, 'Consultant-approved movement'),
    top_three_priorities: xmlSafe(goals.slice(0, 3).join(' • '), 'Build consistency and support the client goals'),
  };
  for (const [head, presentation] of Object.entries(externalMealPresentation)) {
    tokenMap[`${presentation.prefix}_window`] = presentation.window;
    tokenMap[`${presentation.prefix}_focus`] = presentation.focus;
    const meal = (snapshot.meals || []).find((item: any) => item.mealHead === head);
    for (let index = 0; index < 5; index += 1) {
      const option = meal?.options?.[index] || {};
      const components = Array.isArray(option.components) ? option.components : [];
      const slot = index + 1;
      tokenMap[`${presentation.prefix}_${slot}_meal`] = xmlSafe(option.clientTitle || components.map((item: any) => item.foodDisplayNameSnapshot).filter(Boolean).join(' + '));
      tokenMap[`${presentation.prefix}_${slot}_portion`] = xmlSafe(option.humanServingSummary || components.map((item: any) => item.label).filter(Boolean).join(' • '));
      tokenMap[`${presentation.prefix}_${slot}_prep`] = xmlSafe(option.prepNote, 'Follow the listed portion and serving guidance.');
      tokenMap[`${presentation.prefix}_${slot}_kcal`] = option.nutrition?.kcal == null ? 'Not available' : Number(option.nutrition.kcal).toFixed(1).replace(/\.0$/, '');
      tokenMap[`${presentation.prefix}_${slot}_protein`] = option.nutrition?.protein == null ? 'Not available' : Number(option.nutrition.protein).toFixed(1).replace(/\.0$/, '');
    }
  }
  const hydration = [
    ['On waking', '300–400 ml', 'Start early so hydration is not back-loaded at night.'],
    ['With breakfast', '250–300 ml', 'Keep water available through the morning.'],
    ['Before lunch', '300 ml', 'Support appetite pacing and meal consistency.'],
    ['Mid-afternoon', '300 ml', 'Maintain hydration through the afternoon.'],
    ['Early evening', '250–300 ml', 'Finish most of the target before late evening.'],
  ];
  hydration.forEach((item, index) => { const slot = index + 1; tokenMap[`hydration_${slot}_anchor`] = item[0]; tokenMap[`hydration_${slot}_quantity`] = item[1]; tokenMap[`hydration_${slot}_note`] = item[2]; });
  const tips = ['Choose one option from each meal section.', 'Use the listed portions rather than combining options.', 'Keep meal timing consistent where practical.', 'Track hunger, energy and digestion.', 'Use the substitution table when needed.', 'Keep hydration steady through the day.', 'Review tolerance and adherence with the consultant.', 'Discuss clinical changes with a qualified professional.'];
  tips.forEach((tip, index) => { tokenMap[`weekly_tip_${index + 1}`] = tip; });
  const substitutions = [['protein', 'Current routine protein choice', 'Consultant-verified protein option'], ['cereal_grain', 'Refined grain choice', 'Millet, oats, brown rice or hand-pounded rice'], ['vegetable', 'Minimal vegetable intake', 'One cooked and one raw vegetable element'], ['fruit', 'Juice or sweet beverage', 'Whole fruit paired with nuts or curd'], ['dairy_equivalent', 'Sweetened dairy drink', 'Unsweetened curd, buttermilk or soy curd']];
  substitutions.forEach(([key, usual, alternative]) => { tokenMap[`${key}_usual`] = usual; tokenMap[`${key}_alternative`] = alternative; });
  for (let slot = 1; slot <= 3; slot += 1) { tokenMap[`supplement_${slot}`] = 'Consultant review only'; tokenMap[`supplement_${slot}_dose`] = 'As advised'; tokenMap[`supplement_${slot}_timing`] = 'After review'; tokenMap[`supplement_${slot}_duration`] = 'To be confirmed'; tokenMap[`supplement_${slot}_note`] = 'Use only when clinically approved.'; }
  const xmlTargets = ['word/document.xml', 'word/header1.xml', 'word/footer1.xml'];
  await Promise.all(xmlTargets.map(async (target) => { const file = zip.file(target); if (!file) return; zip.file(target, replaceTokens(await file.async('string'), tokenMap)); }));
  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const filename = `${sanitizeName(ensureString(input.client.display_name, 'client'))}_Diet_Plan_${now.toISOString().slice(0, 10)}.docx`;
  return { buffer: outputBuffer, filename, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
};

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
