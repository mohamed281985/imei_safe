const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'translations');
if (!fs.existsSync(dir)) {
  console.error('Translations directory not found:', dir);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

const keyRegex = /^[ \t]*(["'`])([^"'`]+)\1\s*:\s*(.+)$/;

files.forEach(file => {
  const p = path.join(dir, file);
  const content = fs.readFileSync(p, 'utf8');

  const exportIdx = content.indexOf('export default');
  if (exportIdx === -1) {
    console.warn(`Skipping ${file}: no export default found.`);
    return;
  }

  const braceStart = content.indexOf('{', exportIdx);
  if (braceStart === -1) {
    console.warn(`Skipping ${file}: no object brace found.`);
    return;
  }

  // Find matching closing brace for the export object
  let depth = 0;
  let i = braceStart;
  let braceEnd = -1;
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }

  if (braceEnd === -1) {
    console.warn(`Skipping ${file}: could not find matching closing brace.`);
    return;
  }

  const header = content.slice(0, braceStart + 1);
  const body = content.slice(braceStart + 1, braceEnd);
  const footer = content.slice(braceEnd);

  const lines = body.split(/\r?\n/);

  const lastSeen = new Map(); // key -> { line, idx }

  lines.forEach((ln, idx) => {
    const m = ln.match(keyRegex);
    if (m) {
      const key = m[2];
      lastSeen.set(key, { line: ln.trim(), idx });
    }
  });

  if (lastSeen.size === 0) {
    console.log(`No keys found in ${file}`);
    return;
  }

  // Sort keys by their last seen index to preserve last-occurrence ordering
  const sortedEntries = [...lastSeen.entries()].sort((a, b) => a[1].idx - b[1].idx).map(([k, v]) => v.line);

  // Ensure each line ends with a comma to form valid object entries
  const normalized = sortedEntries.map((ln) => {
    const raw = ln;
    const commentIdx = raw.indexOf('//');
    if (commentIdx !== -1) {
      const codePart = raw.slice(0, commentIdx).trimEnd();
      const commentPart = raw.slice(commentIdx);
      const codeTrim = codePart.trimEnd();
      if (!codeTrim.endsWith(',')) {
        return codeTrim + ',' + ' ' + commentPart.trim();
      }
      return codeTrim + ' ' + commentPart.trim();
    } else {
      const trimmed = raw.trim();
      if (trimmed.endsWith(',')) return trimmed;
      return trimmed + ',';
    }
  });

  const newBody = '\n  ' + normalized.join('\n  ') + '\n';

  const newContent = header + newBody + footer;

  fs.writeFileSync(p, newContent, 'utf8');
  console.log(`Dedupe applied to ${file} — keys: ${lastSeen.size}`);
});

console.log('Dedupe complete. Please run build to verify.');
