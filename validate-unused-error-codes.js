// validate-unused-error-codes.js
const fs = require('fs');
const path = require('path');

const ERROR_CODES_PATH = path.join(
  __dirname,
  'src',
  'constants',
  'error-codes.js'
);
const SRC_DIR = path.join(__dirname, 'src');
const IGNORED_DIRS = ['node_modules', 'tests', 'build', 'assets'];

function getAllFiles(dir, files = []) {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!IGNORED_DIRS.includes(file)) getAllFiles(fullPath, files);
    } else if (fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  });
  return files;
}

function extractErrorNames(errorModule) {
  const names = new Set();

  for (const [key, group] of Object.entries(errorModule)) {
    if (
      key === 'SEVERITY' ||
      key === 'CATEGORY' ||
      typeof group !== 'object' ||
      group === null ||
      typeof group.code === 'number' // éviter les vrais objets d'erreurs eux-mêmes
    )
      continue;

    for (const [errKey, errValue] of Object.entries(group)) {
      if (errValue && typeof errValue === 'object' && errValue.name) {
        names.add(errValue.name);
      }
    }
  }

  return Array.from(names);
}

function fileUsesErrorName(content, errorName) {
  const patterns = [
    errorName,
    `'${errorName}'`,
    `"${errorName}"`,
    `\`${errorName}\``
  ];
  return patterns.some((p) => content.includes(p));
}

function main() {
  const errorCodes = require(ERROR_CODES_PATH);
  const allErrorNames = extractErrorNames(errorCodes);
  const allFiles = getAllFiles(SRC_DIR);

  const unused = [];

  for (const errorName of allErrorNames) {
    let found = false;
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (fileUsesErrorName(content, errorName)) {
        found = true;
        break;
      }
    }
    if (!found) unused.push(errorName);
  }

  if (unused.length > 0) {
    console.log('⚠️  Erreurs définies mais non utilisées :');
    unused.forEach((name) => console.log(`- ${name}`));
    process.exitCode = 1;
  } else {
    console.log("✅ Tous les codes d'erreur sont utilisés dans le projet.");
  }
}

main();
