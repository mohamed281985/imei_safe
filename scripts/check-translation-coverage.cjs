const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const translationsDir = path.join(projectRoot, 'src', 'translations');
const sourceDir = path.join(projectRoot, 'src');
const languages = ['en', 'ar', 'fr', 'hi'];

function readTranslationKeys(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const keys = new Set();
  const duplicates = new Set();

  function visit(node) {
    if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
      for (const property of node.expression.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = property.name;
        if (ts.isStringLiteral(name) || ts.isIdentifier(name)) {
          if (keys.has(name.text)) duplicates.add(name.text);
          keys.add(name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
  return { keys, duplicates };
}

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [entryPath] : [];
  });
}

const parsedCatalogs = Object.fromEntries(languages.map((language) => [
  language,
  readTranslationKeys(path.join(translationsDir, `${language}.ts`)),
]));
const catalogs = Object.fromEntries(languages.map((language) => [language, parsedCatalogs[language].keys]));
const allKeys = new Set(Object.values(catalogs).flatMap((keys) => [...keys]));
let failures = 0;

for (const language of languages) {
  const duplicates = [...parsedCatalogs[language].duplicates];
  if (duplicates.length) {
    failures += duplicates.length;
    console.error(`${language}: duplicate translation key(s): ${duplicates.join(', ')}`);
  }

  const missing = [...allKeys].filter((key) => !catalogs[language].has(key));
  if (missing.length) {
    failures += missing.length;
    console.error(`${language}: missing ${missing.length} translation key(s): ${missing.join(', ')}`);
  }
}

const missingUsages = new Map();
for (const filePath of collectSourceFiles(sourceDir)) {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isTranslationCall = ts.isIdentifier(expression)
        ? expression.text === 't'
        : ts.isPropertyAccessExpression(expression) && expression.name.text === 't';
      const argument = node.arguments[0];
      if (isTranslationCall && argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
        if (!allKeys.has(argument.text)) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          const usage = `${path.relative(projectRoot, filePath)}:${line + 1}`;
          if (!missingUsages.has(argument.text)) missingUsages.set(argument.text, []);
          missingUsages.get(argument.text).push(usage);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
}

if (missingUsages.size) {
  failures += missingUsages.size;
  console.error(`Source uses ${missingUsages.size} undefined translation key(s):`);
  for (const [key, usages] of missingUsages) console.error(`  ${key}: ${usages.join(', ')}`);
}

if (failures) process.exitCode = 1;
else console.log(`Translation coverage passed: ${allKeys.size} keys across ${languages.length} languages, with no duplicates.`);