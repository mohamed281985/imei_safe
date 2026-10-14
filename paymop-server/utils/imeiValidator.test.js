import test from 'node:test';
import assert from 'node:assert/strict';
import { isImeiAllowed, isValidImei, normalizeImei } from './imeiValidator.js';

test('accepts a valid 15-digit IMEI', () => {
  assert.equal(isValidImei('490154203237518'), true);
});

test('converts Arabic and Persian numerals to ASCII digits', () => {
  assert.equal(normalizeImei('٤٩٠١٥٤٢٠٣٢٣٧٥١٨'), '490154203237518');
  assert.equal(normalizeImei('۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸'), '490154203237518');
  assert.equal(isValidImei('٤٩٠١٥٤٢٠٣٢٣٧٥١٨'), true);
});

test('rejects short, repeated, and invalid-check-digit IMEIs', () => {
  assert.equal(isValidImei('123'), false);
  assert.equal(isValidImei('111111111111111'), false);
  assert.equal(isValidImei('490154203237519'), false);
});

test('only admins can bypass IMEI validation', () => {
  const randomImei = '490154203237519';
  assert.equal(isValidImei(randomImei), false);
  assert.equal(isImeiAllowed(randomImei, 'admin'), true);
  assert.equal(isImeiAllowed(randomImei, ' ADMIN '), true);
  assert.equal(isImeiAllowed(randomImei, 'admin_user'), true);
  assert.equal(isImeiAllowed('123', 'admin'), false);
  assert.equal(isImeiAllowed(randomImei, 'gold_user'), false);
  assert.equal(isImeiAllowed(randomImei, 'gold_business'), false);
});