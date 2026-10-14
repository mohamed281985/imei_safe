import { isValidImei, normalizeImei } from './imeiValidation.js';

const LABEL_PATTERN = /\bIMEI\s*[:#-]?\s*([12])?\b/gi;
const OTHER_IDENTIFIER_PATTERN = /\b(?:ICCID|MSISDN|MEID|EID|SERIAL(?:\s*(?:NO|NUMBER))?)\b/gi;

export function findImeisNearLabels(text) {
  const source = String(text || '');
  const candidates = new Set();

  // OCR labels are optional; only inspect contiguous digit runs so longer IDs
  // cannot be partially accepted and separated fragments are never combined.
  const digitRuns = source.match(/[0-9٠-٩۰-۹０-９]+/gu) || [];
  for (const digitRun of digitRuns) {
    if (digitRun.length !== 15) continue;
    const imei = normalizeImei(digitRun);
    if (imei.length === 15 && isValidImei(imei)) candidates.add(imei);
  }

  return [...candidates];
}

export function getImeiOcrDiagnostics(text, candidates = []) {
  const source = String(text || '');
  const labels = [...source.matchAll(LABEL_PATTERN)].length;
  const identifiers = [...source.matchAll(OTHER_IDENTIFIER_PATTERN)].length;
  const digitGroups = source.match(/[0-9٠-٩۰-۹０-９]+/gu) || [];
  return {
    textLength: source.length,
    lineCount: source.split(/\r?\n/).length,
    imeiLabelCount: labels,
    otherIdentifierCount: identifiers,
    digitGroupCount: digitGroups.length,
    digitCharacterCount: normalizeImei(source).length,
    candidateCount: candidates.length,
  };
}