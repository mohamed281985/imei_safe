import assert from 'node:assert/strict';
import test from 'node:test';
import { pointsForDiscountPercent } from './rewardPoints.js';

test('assigns the configured points to each discount tier', () => {
  const cases = [
    [1, 500],
    [10, 500],
    [11, 1000],
    [20, 1000],
    [21, 1500],
    [30, 1500],
    [31, 2000],
    [40, 2000],
    [41, 3000],
    [50, 3000],
    [51, 4000],
    [60, 4000],
    [61, 5000],
    [100, 8000],
  ];

  for (const [discount, expectedPoints] of cases) {
    assert.equal(pointsForDiscountPercent(discount), expectedPoints, `${discount}% discount`);
  }
});

test('rejects invalid discount percentages', () => {
  for (const discount of [0, -1, 101, 10.5, Number.NaN]) {
    assert.equal(pointsForDiscountPercent(discount), 0);
  }
});