const test = require('node:test');
const assert = require('node:assert/strict');
const { renewalWindow, renewalCycleKey } = require('../jobs/refreshUsdRenewalPrices');

test('refreshes a renewal in the six-hour window before billing', () => {
  assert.equal(renewalWindow(new Date('2026-09-21T17:00:00Z'), Date.parse('2026-09-21T12:00:00Z')), 'refresh');
});

test('does not refresh early and flags a missed cutoff', () => {
  assert.equal(renewalWindow(new Date('2026-09-23T00:00:00Z'), Date.parse('2026-09-21T12:00:00Z')), 'early');
  assert.equal(renewalWindow(new Date('2026-09-21T13:00:00Z'), Date.parse('2026-09-21T12:00:00Z')), 'late');
});

test('uses subscription and cycle as the idempotency key', () => {
  assert.equal(renewalCycleKey('sub_1', new Date('2026-09-23T00:00:00Z')), 'sub_1:2026-09-23T00:00:00.000Z');
});
