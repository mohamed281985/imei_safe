const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'translations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

function findKeys(content) {
  const lines = content.split(/\r?\n/);
  const keyMap = new Map();
  const keyRegex = /^[ \t]*["'`]([^"'`]+)["'`]\s*:\s*/;
  lines.forEach((line, idx) => {
    const m = line.match(keyRegex);
    if (m) {
      const key = m[1];
      if (!keyMap.has(key)) keyMap.set(key, []);
      keyMap.get(key).push(idx + 1);
    }
  });
  return keyMap;
}

let totalDuplicates = 0;
files.forEach(file => {
  const p = path.join(dir, file);
  const content = fs.readFileSync(p, 'utf8');
  const keys = findKeys(content);
  const duplicates = [...keys.entries()].filter(([, arr]) => arr.length > 1);
  if (duplicates.length) {
    console.log(`\nDuplicates in ${file}:`);
    duplicates.forEach(([k, lines]) => {
      console.log(`  ${k}: lines ${lines.join(', ')}`);
      totalDuplicates++;
    });
  } else {
    console.log(`\nNo duplicates in ${file}`);
  }
});

if (totalDuplicates === 0) {
  console.log('\nNo duplicate keys found across translation files.');
} else {
  console.log(`\nFound ${totalDuplicates} duplicate key(s) across translation files.`);
  console.log('You can choose to auto-dedupe (keep last occurrence) or review and merge manually.');
}
