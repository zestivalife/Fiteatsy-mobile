import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const VERSION = 'FITEATSY-NUTRITION-CATALOGUE-v1';
const GENERATED_AT = '2026-09-01T00:00:00.000Z';
const FOUNDATION_RELEASE = '2026-04-30';
const SR_RELEASE = '2018-04';
const uuid = (scope, value) => {
  const hex = createHash('sha256').update(`${VERSION}:${scope}:${value}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};

const selections = [
  [321360,'grape-tomato','Grape tomato','vegetable',['indian'],['vegan'],[]],
  [323294,'almonds-roasted','Roasted almonds','nuts',['indian'],['vegan'],['tree_nuts']],
  [330137,'greek-yogurt','Greek yoghurt','dairy',['indian'],['vegetarian'],['milk']],
  [330458,'coconut-oil','Coconut oil','oil',['south_indian'],['vegan'],[]],
  [331960,'chicken-breast-cooked','Cooked chicken breast','poultry',['indian'],['non_vegetarian'],[]],
  [331897,'chicken-drumstick-cooked','Cooked chicken drumstick','poultry',['indian'],['non_vegetarian'],[]],
  [746771,'orange','Orange','fruit',['indian'],['vegan'],[]],
  [746778,'whole-milk','Whole milk','dairy',['indian'],['vegetarian'],['milk']],
  [172336,'canola-oil','Canola oil','oil',['indian'],['vegan'],[]],
  [171413,'olive-oil','Olive oil','oil',['indian'],['vegan'],[]],
  [747447,'broccoli-raw','Raw broccoli','vegetable',['indian'],['vegan'],[]],
  [789890,'wheat-flour','Wheat flour','grain',['north_indian'],['vegan'],['gluten']],
  [790085,'whole-wheat-flour','Whole wheat flour','grain',['north_indian'],['vegan'],['gluten']],
  [790214,'rice-flour','Rice flour','grain',['south_indian'],['vegan'],[]],
  [790577,'onion','Onion','vegetable',['indian'],['vegan'],[]],
  [1105314,'banana','Banana','fruit',['indian'],['vegan'],[]],
  [1750339,'apple','Apple','fruit',['indian'],['vegan'],[]],
  [1999632,'spinach','Spinach','vegetable',['indian'],['vegan'],[]],
  [1999634,'roma-tomato','Roma tomato','vegetable',['indian'],['vegan'],[]],
  [2258586,'carrot','Carrot','vegetable',['indian'],['vegan'],[]],
  [2259793,'plain-yogurt','Plain yoghurt','dairy',['indian'],['vegetarian'],['milk']],
  [2259792,'buttermilk','Low-fat buttermilk','dairy',['gujarati','rajasthani'],['vegetarian'],['milk']],
  [2262072,'peanut-butter','Peanut butter','nuts',['indian'],['vegan'],['peanuts']],
  [2262075,'flaxseed-ground','Ground flaxseed','seeds',['indian'],['vegan'],[]],
  [2346398,'pineapple','Pineapple','fruit',['indian'],['vegan'],[]],
  [2346400,'green-beans','Green beans','vegetable',['indian'],['vegan'],[]],
  [2346401,'potato','Potato','vegetable',['indian'],['vegan'],[]],
  [2346404,'sweet-potato','Sweet potato','vegetable',['indian'],['vegan'],[]],
  [2346407,'cabbage','Cabbage','vegetable',['indian'],['vegan'],[]],
  [2512379,'millet','Millet','grain',['rajasthani','gujarati'],['vegan'],[]],
  [2512380,'brown-rice-raw','Brown rice, raw','grain',['indian'],['vegan'],[]],
  [2512381,'white-rice-raw','White rice, raw','grain',['indian'],['vegan'],[]],
  [2515376,'peanuts','Peanuts','nuts',['maharashtrian','gujarati'],['vegan'],['peanuts']],
  [2644282,'chickpeas-dry','Chickpeas, dry','legume',['north_indian','punjabi'],['vegan'],[]],
  [2644283,'lentils-dry','Lentils, dry','legume',['indian'],['vegan'],[]],
  [2644289,'kidney-beans','Kidney beans, canned','legume',['north_indian','punjabi'],['vegan'],[]],
  [2644291,'green-peas','Green peas, canned','legume',['indian'],['vegan'],[]],
  [2685573,'cauliflower','Cauliflower, raw','vegetable',['indian'],['vegan'],[]],
  [2710833,'mango','Mango','fruit',['indian'],['vegan'],[]],
  [168448,'pumpkin','Pumpkin, raw','vegetable',['indian'],['vegan'],[]],
  [168917,'quinoa-cooked','Quinoa, cooked','grain',['indian'],['vegan'],[]],
  [169137,'mung-sprouts-cooked','Mung sprouts, cooked','legume',['maharashtrian','gujarati'],['vegan'],[]],
  [169225,'cucumber','Cucumber','vegetable',['indian'],['vegan'],[]],
  [169228,'eggplant','Eggplant','vegetable',['indian'],['vegan'],[]],
  [169230,'garlic','Garlic','spice',['indian'],['vegan'],[]],
  [169231,'ginger','Ginger','spice',['indian'],['vegan'],[]],
  [169260,'okra','Okra','vegetable',['indian'],['vegan'],[]],
  [169705,'oats','Oats','grain',['indian'],['vegan'],['gluten']],
  [172185,'omelet','Omelette','egg',['indian'],['eggetarian'],['egg']],
  [172448,'tofu-firm','Firm tofu','protein',['indian'],['vegan'],['soy']],
  [174235,'fish-cooked','Cooked fish','fish',['bengali'],['non_vegetarian'],['fish']],
  [170923,'cumin','Cumin seed','spice',['indian'],['vegan'],[]],
  [172231,'turmeric','Turmeric','spice',['indian'],['vegan'],[]],
  [170922,'coriander-seed','Coriander seed','spice',['indian'],['vegan'],[]],
  [170150,'sesame','Sesame seed','seeds',['indian'],['vegan'],['sesame']],
  [168191,'dates','Medjool dates','fruit',['indian'],['vegan'],[]],
  [169926,'papaya','Papaya','fruit',['indian'],['vegan'],[]],
  [167746,'lemon','Lemon','fruit',['indian'],['vegan'],[]]
];

const nutrientSpecs = {
  calories: { ids: [1008, 2048, 2047], unit: 'kcal' }, proteinGrams: { ids: [1003], unit: 'g' },
  carbohydrateGrams: { ids: [1005], unit: 'g' }, fatGrams: { ids: [1004], unit: 'g' },
  fibreGrams: { ids: [1079], unit: 'g' }, ironMg: { ids: [1089], unit: 'mg' },
  calciumMg: { ids: [1087], unit: 'mg' }, magnesiumMg: { ids: [1090], unit: 'mg' },
  potassiumMg: { ids: [1092], unit: 'mg' }, zincMg: { ids: [1095], unit: 'mg' },
  vitaminCMg: { ids: [1162], unit: 'mg' }, vitaminB12Mcg: { ids: [1178], unit: 'µg' },
  folateDfeMcg: { ids: [1190], unit: 'µg' }, vitaminDMcg: { ids: [1114], unit: 'µg' },
  vitaminARaeMcg: { ids: [1106], unit: 'µg' }
};
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const nutrientsFor = (record) => Object.fromEntries(Object.entries(nutrientSpecs).map(([key, spec]) => {
  const hit = spec.ids.map((id) => record.foodNutrients?.find(
    (item) => item.nutrient?.id === id && item.nutrient?.unitName === spec.unit,
  )).find(Boolean);
  return [key, numeric(hit?.amount)];
}));

const recipeDefs = [
  ['vegetable-poha','Vegetable poha','maharashtrian',['white-rice-raw',60],['onion',30],['green-peas',30],['carrot',25],['peanuts',10],['canola-oil',5]],
  ['millet-upma','Millet vegetable upma','south_indian',['millet',60],['onion',25],['carrot',25],['green-peas',25],['canola-oil',5]],
  ['moong-sprout-bowl','Moong sprout bowl','maharashtrian',['mung-sprouts-cooked',160],['cucumber',50],['roma-tomato',50],['lemon',10],['peanuts',10]],
  ['besan-style-chilla','Chickpea chilla','north_indian',['chickpeas-dry',60],['onion',30],['roma-tomato',30],['canola-oil',5],['cumin',1]],
  ['lentil-chilla','Lentil chilla','north_indian',['lentils-dry',60],['onion',25],['spinach',30],['canola-oil',5]],
  ['whole-wheat-roti','Whole wheat roti','north_indian',['whole-wheat-flour',60],['canola-oil',2]],
  ['millet-roti','Millet roti','rajasthani',['millet',65],['canola-oil',2]],
  ['rice-lentil-khichdi','Rice and lentil khichdi','gujarati',['white-rice-raw',45],['lentils-dry',35],['carrot',30],['green-peas',30],['canola-oil',5],['turmeric',1]],
  ['brown-rice-dal','Brown rice with dal','indian',['brown-rice-raw',55],['lentils-dry',45],['spinach',40],['canola-oil',5]],
  ['rajma-rice','Rajma rice','punjabi',['kidney-beans',150],['white-rice-raw',55],['onion',30],['roma-tomato',50],['canola-oil',5]],
  ['chana-rice','Chana rice bowl','north_indian',['chickpeas-dry',55],['brown-rice-raw',50],['onion',25],['roma-tomato',40],['canola-oil',5]],
  ['tofu-spinach','Tofu palak','north_indian',['tofu-firm',120],['spinach',120],['onion',30],['roma-tomato',40],['canola-oil',5]],
  ['tofu-bhurji','Tofu bhurji','north_indian',['tofu-firm',140],['onion',35],['roma-tomato',50],['green-peas',25],['canola-oil',5]],
  ['egg-vegetable-omelette','Vegetable omelette','indian',['omelet',120],['onion',25],['roma-tomato',30],['spinach',25]],
  ['chicken-rice-bowl','Chicken rice bowl','indian',['chicken-breast-cooked',120],['brown-rice-raw',50],['green-beans',50],['canola-oil',5]],
  ['chicken-millet-bowl','Chicken millet bowl','rajasthani',['chicken-drumstick-cooked',130],['millet',55],['carrot',40],['canola-oil',5]],
  ['bengali-fish-rice','Bengali fish and rice','bengali',['fish-cooked',120],['white-rice-raw',55],['cabbage',50],['canola-oil',5]],
  ['fish-brown-rice','Fish with brown rice','bengali',['fish-cooked',120],['brown-rice-raw',55],['green-beans',60],['canola-oil',5]],
  ['okra-roti-bowl','Okra with whole wheat roti','north_indian',['okra',140],['whole-wheat-flour',60],['onion',30],['canola-oil',5]],
  ['eggplant-millet-bowl','Eggplant millet bowl','rajasthani',['eggplant',140],['millet',55],['onion',30],['canola-oil',5]],
  ['cauliflower-pea-bowl','Cauliflower pea bowl','north_indian',['cauliflower',140],['green-peas',60],['whole-wheat-flour',55],['canola-oil',5]],
  ['cabbage-chana-bowl','Cabbage chana bowl','gujarati',['cabbage',120],['chickpeas-dry',50],['onion',25],['canola-oil',5]],
  ['pumpkin-lentil-bowl','Pumpkin dal bowl','indian',['pumpkin',150],['lentils-dry',45],['brown-rice-raw',45],['canola-oil',5]],
  ['broccoli-tofu-bowl','Broccoli tofu bowl','indian',['broccoli-raw',120],['tofu-firm',120],['brown-rice-raw',45],['canola-oil',5]],
  ['oats-yogurt-bowl','Oats yoghurt bowl','indian',['oats',50],['plain-yogurt',150],['banana',70],['flaxseed-ground',8]],
  ['oats-apple-bowl','Apple oats bowl','indian',['oats',50],['whole-milk',180],['apple',80],['almonds-roasted',8]],
  ['banana-peanut-oats','Banana peanut oats','indian',['oats',50],['banana',90],['peanut-butter',15],['whole-milk',150]],
  ['papaya-yogurt-bowl','Papaya yoghurt bowl','indian',['papaya',160],['plain-yogurt',150],['flaxseed-ground',8]],
  ['mango-yogurt-bowl','Mango yoghurt bowl','indian',['mango',140],['plain-yogurt',150],['almonds-roasted',8]],
  ['fruit-nut-bowl','Fruit and nut bowl','indian',['apple',80],['orange',100],['banana',60],['almonds-roasted',12]],
  ['pineapple-yogurt-bowl','Pineapple yoghurt bowl','indian',['pineapple',150],['greek-yogurt',150],['flaxseed-ground',8]],
  ['sweet-potato-chana','Sweet potato chana bowl','indian',['sweet-potato',150],['chickpeas-dry',45],['cucumber',50],['lemon',10]],
  ['potato-pea-sabzi','Potato pea sabzi with roti','north_indian',['potato',130],['green-peas',60],['whole-wheat-flour',55],['canola-oil',5]],
  ['vegetable-quinoa','Vegetable quinoa bowl','indian',['quinoa-cooked',180],['carrot',40],['green-beans',40],['tofu-firm',80],['olive-oil',5]],
  ['sprout-yogurt-chaat','Sprout yoghurt chaat','maharashtrian',['mung-sprouts-cooked',140],['plain-yogurt',100],['cucumber',40],['roma-tomato',40],['lemon',10]],
  ['chickpea-salad','Indian chickpea salad','indian',['chickpeas-dry',55],['cucumber',60],['roma-tomato',60],['onion',20],['lemon',10]],
  ['peanut-cucumber-snack','Peanut cucumber snack','maharashtrian',['peanuts',25],['cucumber',120],['lemon',10]],
  ['roasted-almond-fruit','Almond fruit snack','indian',['almonds-roasted',20],['apple',120]],
  ['buttermilk-flax','Buttermilk with flaxseed','gujarati',['buttermilk',250],['flaxseed-ground',8],['cumin',1]],
  ['milk-dates','Milk with dates','indian',['whole-milk',220],['dates',30]],
  ['yogurt-flax','Yoghurt flax bowl','indian',['plain-yogurt',180],['flaxseed-ground',10]],
  ['orange-almonds','Orange with almonds','indian',['orange',160],['almonds-roasted',15]],
  ['banana-peanut','Banana with peanut butter','indian',['banana',120],['peanut-butter',15]],
  ['apple-peanut','Apple with peanuts','indian',['apple',140],['peanuts',20]],
  ['papaya-flax','Papaya with flaxseed','indian',['papaya',180],['flaxseed-ground',8]],
  ['warm-milk','Warm milk','indian',['whole-milk',250]],
  ['warm-milk-almond','Warm milk with almonds','indian',['whole-milk',220],['almonds-roasted',12]],
  ['yogurt-cucumber','Cucumber yoghurt','indian',['plain-yogurt',180],['cucumber',80],['cumin',1]],
  ['lemon-water-date','Lemon water with date','indian',['lemon',20],['dates',24]],
  ['fruit-milk-bowl','Fruit milk bowl','indian',['whole-milk',180],['banana',60],['apple',60],['flaxseed-ground',6]],
  ['tofu-millet-bowl','Tofu millet bowl','rajasthani',['tofu-firm',120],['millet',55],['green-beans',50],['canola-oil',5]],
  ['chicken-vegetable-bowl','Chicken vegetable bowl','indian',['chicken-breast-cooked',130],['broccoli-raw',70],['carrot',50],['olive-oil',5]],
  ['fish-vegetable-bowl','Fish vegetable bowl','bengali',['fish-cooked',130],['spinach',80],['green-beans',60],['canola-oil',5]],
  ['lentil-spinach-soup','Lentil spinach soup','indian',['lentils-dry',50],['spinach',80],['roma-tomato',50],['onion',25],['canola-oil',3]],
  ['chickpea-cabbage-soup','Chickpea cabbage soup','indian',['chickpeas-dry',50],['cabbage',100],['roma-tomato',50],['canola-oil',3]]
];

const mealKeys = ['earlyMorning','breakfast','midMorningSnack','lunch','eveningSnack','dinner','bedtimeNutrition'];
const canonicalTag = (value) => value.replaceAll('_', '-');
const mealForRecipe = (code, index) => {
  if (/warm|milk-dates|yogurt-flax/.test(code)) return 'bedtimeNutrition';
  if (/lemon-water|orange-almond|papaya-flax/.test(code)) return 'earlyMorning';
  if (/snack|fruit|banana-peanut|apple-peanut|buttermilk/.test(code)) return index % 2 ? 'midMorningSnack' : 'eveningSnack';
  if (/poha|upma|chilla|omelette|oats|sprout-yogurt/.test(code)) return 'breakfast';
  return index % 2 ? 'dinner' : 'lunch';
};

const calculate = (components, foodsBySlug) => {
  const keys = new Set(Object.keys(nutrientSpecs));
  return Object.fromEntries([...keys].map((key) => {
    const values = components.map(([slug, grams]) => [foodsBySlug.get(slug)?.nutrients[key], grams]);
    if (values.some(([value]) => value == null || !Number.isFinite(value))) return [key, null];
    let total = 0;
    for (const [value, grams] of values) total += value * (grams / 100);
    return [key, Math.round(total * 1000) / 1000];
  }));
};

const main = async () => {
  const [foundationPath, srPath, outputPath] = process.argv.slice(2);
  if (!foundationPath || !srPath || !outputPath) throw new Error('Usage: generate-usda-catalogue <foundation.json> <sr-legacy.json> <output.json>');
  const foundation = JSON.parse(await readFile(resolve(foundationPath), 'utf8')).FoundationFoods;
  const sr = JSON.parse(await readFile(resolve(srPath), 'utf8')).SRLegacyFoods;
  const records = new Map([...foundation, ...sr]
    .filter((record) => record && Number.isInteger(record.fdcId))
    .map((record) => [record.fdcId, record]));
  const foods = selections.map(([fdcId, slug, displayName, category, cuisineTags, dietaryTags, allergenTags]) => {
    const record = records.get(fdcId);
    if (!record) throw new Error(`Pinned USDA record ${fdcId} (${slug}) is missing`);
    return { id: uuid('food', fdcId), fdcId, canonicalName: slug, displayName, dataType: record.dataType,
      publicationDate: record.publicationDate ?? (record.dataType === 'Foundation' ? FOUNDATION_RELEASE : SR_RELEASE),
      foodCategory: category, nutrients: nutrientsFor(record), cuisineTags: cuisineTags.map(canonicalTag),
      dietaryTags: dietaryTags.map(canonicalTag), allergenTags,
      portions: [{ id: uuid('portion', `${fdcId}:100g`), label: '100 g', grams: 100 }] };
  });
  const foodsBySlug = new Map(foods.map((food) => [food.canonicalName, food]));
  const normalizedDefs = recipeDefs.map((def) => {
    const [code, displayName, cuisine, ...rawComponents] = def;
    const components = rawComponents.filter(([slug, grams]) => grams > 0 && foodsBySlug.has(slug));
    if (components.length !== rawComponents.filter(([, grams]) => grams > 0).length) throw new Error(`Unknown ingredient in ${code}`);
    const dietaryTags = components.some(([slug]) => foodsBySlug.get(slug).dietaryTags.includes('non-vegetarian')) ? ['non-vegetarian']
      : components.some(([slug]) => foodsBySlug.get(slug).dietaryTags.includes('eggetarian')) ? ['eggetarian']
      : components.some(([slug]) => foodsBySlug.get(slug).allergenTags.includes('milk')) ? ['vegetarian'] : ['vegan'];
    const allergens = [...new Set(components.flatMap(([slug]) => foodsBySlug.get(slug).allergenTags))].sort();
    return { id: uuid('recipe', code), code, displayName, description: `${displayName}, formulated by Fiteatsy from verified USDA ingredients.`,
      yieldGrams: components.reduce((sum,[,grams]) => sum + grams, 0), portions: 1,
      cuisineTags: [canonicalTag(cuisine), 'indian'],
      dietaryTags, allergenTags: allergens, retentionMethod: null,
      components: components.map(([slug, quantityGrams]) => ({ foodId: foodsBySlug.get(slug).id, quantityGrams })),
      nutritionTotals: calculate(components, foodsBySlug) };
  });
  const portionProfiles = [[0.75,'light portion'],[1,'standard portion'],[1.25,'hearty portion'],[1.5,'high-energy portion']];
  const mealVariants = normalizedDefs.flatMap((recipe, index) => portionProfiles.map(([multiplier,label]) => ({
    id: uuid('variant', `${recipe.code}:${multiplier}`), mealKey: mealForRecipe(recipe.code,index),
    name: `${recipe.displayName} — ${label}`, description: `${label} of ${recipe.displayName}.`, householdLabel: label,
    cuisineTags: recipe.cuisineTags, dietaryTags: recipe.dietaryTags, allergenTags: recipe.allergenTags,
    recipeId: recipe.id, portionMultiplier: multiplier,
    nutritionTotals: Object.fromEntries(Object.entries(recipe.nutritionTotals).map(([key,value]) => [key, value == null ? null : Math.round(value * multiplier * 1000) / 1000]))
  })));
  const manifest = { catalogueVersion: VERSION, source: { name: 'USDA FoodData Central', license: 'CC0-1.0', url: 'https://fdc.nal.usda.gov/', releases: [
    { dataType: 'Foundation Foods', release: FOUNDATION_RELEASE, downloadedFrom: 'https://fdc.nal.usda.gov/download-datasets/' },
    { dataType: 'SR Legacy', release: SR_RELEASE, downloadedFrom: 'https://fdc.nal.usda.gov/download-datasets/' }
  ]}, generatedAt: GENERATED_AT, foods, recipes: normalizedDefs, mealVariants };
  const missingMeals = mealKeys.filter((key) => !mealVariants.some((variant) => variant.mealKey === key));
  if (missingMeals.length) throw new Error(`Meal coverage missing: ${missingMeals.join(', ')}`);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ foods: foods.length, recipes: normalizedDefs.length, mealVariants: mealVariants.length, combined: foods.length + normalizedDefs.length + mealVariants.length }));
};

await main();
