import test from 'node:test';
import assert from 'node:assert/strict';
import { isReportCurrentlyActive } from './reportStatus.js';

const now = Date.parse('2026-11-14T12:00:00.000Z');

test('quick report is active before its expiry', () => {
  assert.equal(isReportCurrentlyActive({
    status: 'active',
    report_mode: 'quick',
    expiry: '2026-11-14T12:00:01.000Z',
  }, now), true);
});

test('quick report is inactive at and after expiry', () => {
  assert.equal(isReportCurrentlyActive({
    status: 'active',
    report_mode: 'quick',
    expiry: '2026-11-14T12:00:00.000Z',
  }, now), false);
});

test('quick report without expiry falls back to report date plus 48 hours', () => {
  assert.equal(isReportCurrentlyActive({
    status: 'active',
    report_mode: 'quick',
    report_date: '2026-11-12T12:00:00.000Z',
  }, now), false);
});

test('regular active report is not limited by quick-report expiry', () => {
  assert.equal(isReportCurrentlyActive({
    status: 'active',
    report_mode: null,
    expiry: '2020-01-01T00:00:00.000Z',
  }, now), true);
});