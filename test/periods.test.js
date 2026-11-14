import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salaryPeriodFor, addDays, ubToday, ymd } from '../src/utils/periods.js';

test('цалингийн хугацаа: 11~25 ба 26~10', () => {
  assert.deepEqual(salaryPeriodFor('2026-11-10'), { from: '2026-10-26', to: '2026-11-10' });
  assert.deepEqual(salaryPeriodFor('2026-11-11'), { from: '2026-11-11', to: '2026-11-25' });
  assert.deepEqual(salaryPeriodFor('2026-11-25'), { from: '2026-11-11', to: '2026-11-25' });
  assert.deepEqual(salaryPeriodFor('2026-11-26'), { from: '2026-11-26', to: '2026-12-10' });
});

test('цалингийн хугацаа он, сар дамжина', () => {
  assert.deepEqual(salaryPeriodFor('2026-12-31'), { from: '2026-12-26', to: '2027-01-10' });
  assert.deepEqual(salaryPeriodFor('2027-01-05'), { from: '2026-12-26', to: '2027-01-10' });
  assert.deepEqual(salaryPeriodFor('2026-02-28'), { from: '2026-02-26', to: '2026-03-10' });
});

test('хугацаанууд давхцахгүй, завсаргүй — өдөр бүр яг нэг хугацаанд', () => {
  let date = '2026-01-01';
  let prev = salaryPeriodFor(date);
  while (date < '2028-01-01') {
    const p = salaryPeriodFor(date);
    assert.ok(p.from <= date && date <= p.to, `${date} нь ${p.from}~${p.to}-д багтах ёстой`);
    if (p.from !== prev.from) assert.equal(p.from, addDays(prev.to, 1), `${prev.to}-ийн дараа ${p.from} эхлэх ёстой`);
    prev = p;
    date = addDays(date, 1);
  }
});

test('Улаанбаатарын өнөөдөр нь UTC+8', () => {
  assert.equal(ubToday(Date.parse('2026-11-10T15:59:00Z')), '2026-11-10');
  assert.equal(ubToday(Date.parse('2026-11-10T16:00:00Z')), '2026-11-11');
});

test('ymd ба addDays сар дамжина', () => {
  assert.equal(ymd(2026, 13, 10), '2027-01-10');
  assert.equal(ymd(2026, 0, 26), '2025-12-26');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
