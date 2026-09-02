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
const approvedCatalogueFile = 'fiteatsy-nutrition-catalogue-v1.json';

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
  await fs.mkdir(catalogueDataTargetDir, { recursive: true });
  await fs.copyFile(
    path.join(catalogueDataSourceDir, approvedCatalogueFile),
    path.join(catalogueDataTargetDir, approvedCatalogueFile),
  );
  console.log(`Copied approved nutrition catalogue to ${catalogueDataTargetDir}`);
};

await copyMigrations();
await copyNutritionAssets();
await copyApprovedCatalogue();
