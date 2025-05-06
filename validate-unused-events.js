// validate-unused-events.js
const fs = require('fs');
const path = require('path');

const EVENT_TYPES_PATH = path.join(
  __dirname,
  'src',
  'constants',
  'event-types.js'
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

function extractEventNames(obj) {
  const result = [];

  function recurse(value) {
    if (typeof value === 'string') {
      result.push(value);
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(recurse);
    }
  }

  recurse(obj);
  return result;
}

function fileUsesEvent(content, eventName) {
  return [
    eventName,
    `'${eventName}'`,
    `"${eventName}"`,
    `\`${eventName}\``
  ].some((p) => content.includes(p));
}

function main() {
  const eventTypes = require(EVENT_TYPES_PATH);
  const allEventNames = extractEventNames(eventTypes);
  const allFiles = getAllFiles(SRC_DIR);

  const unused = [];

  for (const eventName of allEventNames) {
    let found = false;

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (fileUsesEvent(content, eventName)) {
        found = true;
        break;
      }
    }

    if (!found) unused.push(eventName);
  }

  if (unused.length > 0) {
    console.log('⚠️  Événements définis mais non utilisés :');
    unused.forEach((name) => console.log(`- ${name}`));
    process.exitCode = 1;
  } else {
    console.log('✅ Tous les événements sont utilisés dans le projet.');
  }
}

main();
