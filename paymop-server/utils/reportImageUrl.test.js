import test from 'node:test';
import assert from 'node:assert/strict';
import { getReportImageStorageLocation } from './reportImageUrl.js';

test('report upload path resolves to phone_reports bucket', () => {
  assert.deepEqual(getReportImageStorageLocation('reports/invoice.jpg', 'registerphone'), {
    bucket: 'phone_reports',
    filePath: 'reports/invoice.jpg',
  });
});

test('legacy registerphone path preserves its bucket', () => {
  assert.deepEqual(getReportImageStorageLocation('registerphone/user/invoice.jpg', 'phone_reports'), {
    bucket: 'registerphone',
    filePath: 'user/invoice.jpg',
  });
});

test('stored signed URL is parsed so a fresh URL can be created', () => {
  assert.deepEqual(getReportImageStorageLocation(
    'https://example.supabase.co/storage/v1/object/sign/phone_reports/reports/invoice%20one.jpg?token=expired',
    'registerphone',
  ), {
    bucket: 'phone_reports',
    filePath: 'reports/invoice one.jpg',
  });
});

test('external URLs are not treated as Supabase storage paths', () => {
  assert.equal(getReportImageStorageLocation('https://cdn.example.com/invoice.jpg', 'phone_reports'), null);
});