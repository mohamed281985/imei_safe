import test from 'node:test';
import assert from 'node:assert/strict';
import { getPromoQuotaCycle } from './promoQuotaCycle.js';

const annualPromo = {
  payment_date: '2026-01-15T10:30:00.000Z',
  promo_duration_months: 12,
  expires_at: '2027-01-15T10:30:00.000Z',
};

test('annual promo returns the first monthly quota cycle', () => {
  assert.deepEqual(getPromoQuotaCycle(annualPromo, '2026-02-01T00:00:00.000Z'), {
    cycleNumber: 1,
    durationMonths: 12,
    startsAt: '2026-01-15T10:30:00.000Z',
    endsAt: '2026-02-15T10:30:00.000Z',
    renewsAt: '2026-02-15T10:30:00.000Z',
  });
});

test('quota starts a new cycle exactly on the monthly anniversary', () => {
  const cycle = getPromoQuotaCycle(annualPromo, '2026-02-15T10:30:00.000Z');
  assert.equal(cycle?.cycleNumber, 2);
  assert.equal(cycle?.startsAt, '2026-02-15T10:30:00.000Z');
  assert.equal(cycle?.endsAt, '2026-03-15T10:30:00.000Z');
});

test('two-month promo subscriptions renew once and stop at the paid expiry', () => {
  const payment = {
    payment_date: '2026-01-15T10:30:00.000Z',
    promo_duration_months: 2,
    expires_at: '2026-03-15T10:30:00.000Z',
  };
  const cycle = getPromoQuotaCycle(payment, '2026-02-20T10:30:00.000Z');

  assert.equal(cycle?.cycleNumber, 2);
  assert.equal(cycle?.startsAt, '2026-02-15T10:30:00.000Z');
  assert.equal(cycle?.endsAt, payment.expires_at);
  assert.equal(cycle?.renewsAt, null);
});

test('month-end cycles stay anchored to the original payment date', () => {
  const cycle = getPromoQuotaCycle({
    payment_date: '2026-01-31T12:00:00.000Z',
    promo_duration_months: 3,
    expires_at: '2026-04-30T12:00:00.000Z',
  }, '2026-03-01T00:00:00.000Z');

  assert.equal(cycle?.cycleNumber, 2);
  assert.equal(cycle?.startsAt, '2026-02-28T12:00:00.000Z');
  assert.equal(cycle?.endsAt, '2026-03-31T12:00:00.000Z');
});

test('the final cycle does not promise a renewal and usage ends at subscription expiry', () => {
  const cycle = getPromoQuotaCycle(annualPromo, '2027-01-01T00:00:00.000Z');
  assert.equal(cycle?.cycleNumber, 12);
  assert.equal(cycle?.endsAt, annualPromo.expires_at);
  assert.equal(cycle?.renewsAt, null);
});

test('expired or invalid promo periods have no active quota cycle', () => {
  assert.equal(getPromoQuotaCycle(annualPromo, annualPromo.expires_at), null);
  assert.equal(getPromoQuotaCycle({ ...annualPromo, promo_duration_months: 0 }), null);
});
