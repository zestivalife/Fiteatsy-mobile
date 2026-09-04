import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(backendRoot, 'src', 'db', 'migrations');
const targetDir = path.join(backendRoot, 'dist', 'db', 'migrations');
const nutritionModuleSourceDir = path.join(backendRoot, 'src', 'modules', 'nutrition');
const nutritionModuleTargetDir = path.join(backendRoot, 'dist', 'modules', 'nutrition');
const catalogueDataSourceDir = path.join(nutritionModuleSourceDir, 'catalogue', 'data');
const catalogueDataTargetDir = path.join(nutritionModuleTargetDir, 'catalogue', 'data');
const catalogueImportDataTargetDir = path.join(backendRoot, 'dist', 'catalogue-import', 'src', 'modules', 'nutrition', 'catalogue', 'data');
const foodCurationDataSourceDir = path.join(nutritionModuleSourceDir, 'food-curation', 'data');
const foodCurationDataTargetDir = path.join(nutritionModuleTargetDir, 'food-curation', 'data');

const copyMigrations = async () => {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  await Promise.all(
    sqlFiles.map((fileName) =>
      fs.copyFile(path.join(sourceDir, fileName), path.join(targetDir, fileName))
    )
  );

  console.log(`Copied ${sqlFiles.length} migration file(s) to ${targetDir}`);
};

const copyNutritionAssets = async () => {
  const entries = await fs.readdir(nutritionModuleSourceDir, { withFileTypes: true });
  const docxFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.docx'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (!docxFiles.length) return;

  await fs.mkdir(nutritionModuleTargetDir, { recursive: true });
  await Promise.all(
    docxFiles.map((fileName) =>
      fs.copyFile(path.join(nutritionModuleSourceDir, fileName), path.join(nutritionModuleTargetDir, fileName))
    )
  );

  console.log(`Copied ${docxFiles.length} nutrition template file(s) to ${nutritionModuleTargetDir}`);
};

const copyApprovedCatalogue = async () => {
  // The production importer is compiled into a separate output tree. Package
  // the complete catalogue-data directory into each runtime tree so its
  // module-relative, allowlisted path can never fall back to a source checkout.
  await Promise.all([
    fs.cp(catalogueDataSourceDir, catalogueDataTargetDir, { recursive: true, force: true }),
    fs.cp(catalogueDataSourceDir, catalogueImportDataTargetDir, { recursive: true, force: true }),
  ]);
  console.log(`Copied nutrition catalogue data directory to ${catalogueDataTargetDir} and ${catalogueImportDataTargetDir}`);
};

const copyGovernedRuntimeAssets = async () => {
  const runtimeAssets = [
    'prepared-food-production-activation.v1.json',
    'batch-1.calculations.v10.json',
    'batch-1.calculations.v11.json',
    'batch-1.validation-release.CP_CHAPATI.v1.json',
    'batch-1.validation-release.CP_BHINDI_SABJI.v1.json',
    'batch-1.validation-release.CP_BHINDI_ALOO.v1.json',
  ];
  await fs.mkdir(foodCurationDataTargetDir, { recursive: true });
  await Promise.all(runtimeAssets.map((fileName) => fs.copyFile(
    path.join(foodCurationDataSourceDir, fileName),
    path.join(foodCurationDataTargetDir, fileName),
  )));
  console.log(`Copied ${runtimeAssets.length} governed Food runtime asset(s) to ${foodCurationDataTargetDir}`);
};

await copyMigrations();
await copyNutritionAssets();
await copyApprovedCatalogue();
await copyGovernedRuntimeAssets();
