import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.svg', '.png'];
const productionExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

const allFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else allFiles.push(absolute);
  }
};
walk(sourceRoot);
const entrypoints = [path.join(root, 'App.tsx')];
const codeFiles = [...allFiles.filter((candidate) => productionExtensions.has(path.extname(candidate))), ...entrypoints];

const resolveRelative = (from, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const sourceBase = /\.(?:js|jsx)$/.test(base) ? base.replace(/\.(?:js|jsx)$/, '') : base;
  const candidates = [base, ...extensions.map((extension) => `${sourceBase}${extension}`), ...extensions.map((extension) => path.join(sourceBase, `index${extension}`))];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
};

const dependencies = new Map();
for (const file of codeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const info = ts.preProcessFile(source, true, true);
  const imports = [...info.importedFiles, ...info.referencedFiles]
    .map(({ fileName }) => resolveRelative(file, fileName))
    .filter(Boolean);
  dependencies.set(file, new Set(imports));
}

const reachable = new Set();
const visit = (file) => {
  if (reachable.has(file)) return;
  reachable.add(file);
  for (const dependency of dependencies.get(file) ?? []) visit(dependency);
};
for (const entrypoint of entrypoints) visit(entrypoint);

for (const declaration of allFiles.filter((file) => file.endsWith('.d.ts'))) reachable.add(declaration);
const expoConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
for (const configuredAsset of [expoConfig.icon, expoConfig.android?.adaptiveIcon?.foregroundImage, expoConfig.web?.favicon]) {
  if (configuredAsset) reachable.add(path.resolve(root, configuredAsset));
}

const relative = (file) => path.relative(root, file);
const productionFiles = allFiles.filter((candidate) => productionExtensions.has(path.extname(candidate)));
const orphanedCode = productionFiles.filter((file) => !reachable.has(file)).map(relative).sort();
const orphanedAssets = allFiles.filter((file) => !productionExtensions.has(path.extname(file)) && !reachable.has(file)).map(relative).sort();

const navigationSource = fs.readFileSync(path.join(sourceRoot, 'navigation/AppNavigation.tsx'), 'utf8');
const registered = [...navigationSource.matchAll(/<(Stack|Tab)\.Screen\s+name="([^"]+)"/g)].map((match) => ({ navigator: match[1], route: match[2] }));
const duplicateRoutes = registered.filter((item, index) => registered.findIndex((candidate) => candidate.navigator === item.navigator && candidate.route === item.route) !== index);
const screenFiles = allFiles.filter((file) => /\/screens\/.*Screen\.tsx$/.test(file));

const cycles = [];
const visiting = new Set();
const visited = new Set();
const stack = [];
const collectCycles = (file) => {
  if (visiting.has(file)) {
    const start = stack.indexOf(file);
    cycles.push(stack.slice(start).concat(file).map(relative));
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  stack.push(file);
  for (const dependency of dependencies.get(file) ?? []) if (productionExtensions.has(path.extname(dependency))) collectCycles(dependency);
  stack.pop();
  visiting.delete(file);
  visited.add(file);
};
for (const entrypoint of entrypoints) collectCycles(entrypoint);

const result = {
  filesAudited: allFiles.length,
  productionCodeFiles: productionFiles.length,
  reachableFiles: [...reachable].filter((file) => file.startsWith(sourceRoot)).length,
  screensAudited: screenFiles.length,
  registeredRoutes: registered.length,
  duplicateRoutes,
  circularDependencies: cycles,
  orphanedCode,
  orphanedAssets,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (orphanedCode.length > 0) process.exitCode = 1;
