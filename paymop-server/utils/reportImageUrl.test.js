import test from 'node:test';
import assert from 'node:assert/strict';
import { getReportImageStorageLocation } from './reportImageUrl.js';

test('report upload path tries registerphone before phone_reports', () => {
  assert.deepEqual(getReportImageStorageLocation('reports/invoice.jpg', 'registerphone'), {
    filePath: 'reports/invoice.jpg',
    buckets: ['registerphone', 'phone_reports'],
  });
});

test('legacy bucket prefix is removed before trying both buckets', () => {
  assert.deepEqual(getReportImageStorageLocation('registerphone/user/invoice.jpg', 'phone_reports'), {
    filePath: 'user/invoice.jpg',
    buckets: ['registerphone', 'phone_reports'],
  });
});

test('stored signed URL is parsed so a fresh URL can be created', () => {
  assert.deepEqual(getReportImageStorageLocation(
    'https://example.supabase.co/storage/v1/object/sign/phone_reports/reports/invoice%20one.jpg?token=expired',
    'registerphone',
  ), {
    filePath: 'reports/invoice one.jpg',
    buckets: ['registerphone', 'phone_reports'],
  });
});

test('external URLs are not treated as Supabase storage paths', () => {
  assert.equal(getReportImageStorageLocation('https://cdn.example.com/invoice.jpg', 'phone_reports'), null);
});

test('signed URL lookup falls back from registerphone to phone_reports', async () => {
  const attemptedBuckets = [];
  const supabase = {
    storage: {
      from(bucket) {
        attemptedBuckets.push(bucket);
        return {
          async createSignedUrl(filePath) {
            assert.equal(filePath, 'reports/invoice.jpg');
            if (bucket === 'registerphone') return { data: null, error: new Error('Object not found') };
            return { data: { signedUrl: 'https://signed.example/invoice.jpg' }, error: null };
          },
        };
      },
    },
  };

  const { createReportImageSignedUrl } = await import('./reportImageUrl.js');
  const signedUrl = await createReportImageSignedUrl(supabase, 'reports/invoice.jpg', 'phone_reports');

  assert.equal(signedUrl, 'https://signed.example/invoice.jpg');
  assert.deepEqual(attemptedBuckets, ['registerphone', 'phone_reports']);
});