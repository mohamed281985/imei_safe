import test from 'node:test';
import assert from 'node:assert/strict';
import { findImeisNearLabels, getImeiOcrDiagnostics } from './imeiOcr.js';

const validImei = '490154203237518';
const otherValidImei = '356938035643809';

test('extracts a labeled IMEI from a device information screen with other identifiers', () => {
  const text = `IMEI1: ${validImei}\nICCID: 89014103211118510720\nMSISDN: 201001234567`;
  assert.deepEqual(findImeisNearLabels(text), [validImei]);
});

test('extracts both explicitly labeled IMEI1 and IMEI2 values', () => {
  const text = `IMEI1 ${validImei}\nIMEI2 ${otherValidImei}`;
  assert.deepEqual(findImeisNearLabels(text), [validImei, otherValidImei]);
});

test('extracts a labeled IMEI from a box label when the value is on the next line', () => {
  assert.deepEqual(findImeisNearLabels(`Model: Phone\nIMEI 1\n${validImei}`), [validImei]);
});

test('extracts an unlabeled IMEI surrounded by punctuation, whitespace, and Arabic text', () => {
  const punctuation = `، , . : ; / \\ - _ ( ) [ ] { } " '${validImei}' "`;
  assert.deepEqual(findImeisNearLabels(`بيانات الهاتف ${punctuation}\nرقم الجهاز`), [validImei]);
});

test('extracts all valid unlabeled IMEIs independently from a full OCR document', () => {
  const text = `فاتورة الهاتف\n${validImei}\nSerial: ${otherValidImei}\nICCID: 89014103211118510720`;
  assert.deepEqual(findImeisNearLabels(text), [validImei, otherValidImei]);
});

test('rejects labeled values that are not 15-digit Luhn-valid IMEIs', () => {
  assert.deepEqual(findImeisNearLabels(`IMEI: 490154203237519\nIMEI2: 123456789012345`), []);
});

test('requires Luhn-valid IMEIs from OCR for every role', () => {
  const text = 'IMEI: 490154203237519';
  assert.deepEqual(findImeisNearLabels(text), []);
  assert.deepEqual(findImeisNearLabels('IMEI: 490154203237518'), [validImei]);
});

test('does not accept a 15-digit substring inside a longer 16- or 17-digit run', () => {
  assert.deepEqual(findImeisNearLabels(`IMEI: ${validImei}6`), []);
  assert.deepEqual(findImeisNearLabels(`(${validImei}42)`), []);
  assert.deepEqual(findImeisNearLabels(`IMEISV: ${validImei}6`), []);
});

test('does not concatenate digits from separate OCR fragments into a candidate', () => {
  assert.deepEqual(findImeisNearLabels('فاتورة: 490 154 203 237 518'), []);
  assert.deepEqual(findImeisNearLabels('IMEI: 490-154-203-237-518'), []);
  assert.deepEqual(findImeisNearLabels(`IMEI: ${validImei} 12345`), [validImei]);
});

test('OCR diagnostics report counts and lengths without exposing recognized digits', () => {
  const diagnostics = getImeiOcrDiagnostics(`IMEI1: ${validImei}\nIMEI2: ${otherValidImei}`, [validImei, otherValidImei]);
  assert.deepEqual(diagnostics, {
    textLength: 45,
    lineCount: 2,
    imeiLabelCount: 2,
    otherIdentifierCount: 0,
    digitGroupCount: 4,
    digitCharacterCount: 32,
    candidateCount: 2,
  });
  assert.equal(JSON.stringify(diagnostics).includes(validImei), false);
});

test('does not guess ambiguous OCR letters as digits', () => {
  assert.deepEqual(findImeisNearLabels('IMEI: 4901542032375O8'), []);
  assert.deepEqual(findImeisNearLabels('IMEI: 4901542032375I8'), []);
});