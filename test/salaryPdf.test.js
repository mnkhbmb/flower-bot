import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSalaryPdf } from '../src/services/salaryPdf.js';

test('цалингийн PDF бүх хэсэгтэйгээ, хоосон хэсэггүй ч үүснэ', async () => {
  const full = await buildSalaryPdf({
    from: '2026-10-26', to: '2026-11-10',
    workers: { 'Туяа': { days: 1, hours: '9.0', rate: 71500, salary: 71500, detail: [{ date: '2026-10-26', in: '10:00', out: '', complete: false, duplicated: true }] } },
    advances: { 'Туяа': 20000 },
    directors: [{ name: 'Саруул', amount: 750000 }],
    finance: { count: 1, days: 1, niit: 100000, belen: 0, dans: 100000, pos: 0, zarlaga: 0, tsever: 100000 },
    bank: { count: 1, income: 67320, expense: 0, incomeBy: { 'Борлуулалт': 67320 }, expenseBy: {}, byAccount: { 'ХасБанк': { in: 67320, out: 0 } } },
    top: { days: 1, waste: 2, flowers: [{ name: 'Сарнай', qty: 30 }], others: [], unknown: [] },
    balances: [{ account: 'Данс', name: 'Данс', since: '2026-11-10 14:00', base: 1000, in: 0, out: 0, balance: 1000 }],
  });
  assert.equal(full.subarray(0, 5).toString(), '%PDF-');

  const empty = await buildSalaryPdf({ from: '2026-10-26', to: '2026-11-10', workers: {}, advances: {}, directors: [] });
  assert.equal(empty.subarray(0, 5).toString(), '%PDF-');
});
