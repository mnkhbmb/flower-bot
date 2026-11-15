import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCountText, buildStockCount } from '../src/utils/stockCount.js';

test('тооллогын бичвэр задлах', () => {
  assert.deepEqual(parseCountText('Са-45 Ро-12'), [{ tovch: 'Са', too: 45 }, { tovch: 'Ро', too: 12 }]);
  assert.deepEqual(parseCountText('са 45, ро 12\nм/сар: 8ш'), [
    { tovch: 'са', too: 45 }, { tovch: 'ро', too: 12 }, { tovch: 'м/сар', too: 8 },
  ]);
  assert.deepEqual(parseCountText('мини сарнай 5ш лили-0'), [{ tovch: 'мини сарнай', too: 5 }, { tovch: 'лили', too: 0 }]);
  assert.deepEqual(parseCountText('1. Са-3'), [{ tovch: 'Са', too: 3 }]);
  assert.deepEqual(parseCountText('тоо байхгүй'), []);
  assert.deepEqual(parseCountText(''), []);
});

test('тооллого: анхны тоо, тоолсон, зөрүү', () => {
  const stock = [
    { key: 2, ner: 'Сарнай', too: 50 },
    { key: 3, ner: 'Ромашка', too: 12 },
    { key: 4, ner: 'Лили', too: 7 },
    { key: 5, ner: 'Башир', too: 3 },
  ];
  const match = t => ({ 'са': 2, 'ро': 3, 'лили': 4 }[t.toLowerCase()] ?? null);
  const counted = parseCountText('Са-40 Ро-12 Лили-9 Са-5 Хх-4 Хх-1');
  assert.deepEqual(buildStockCount(stock, counted, match), {
    lines: [
      { ner: 'Сарнай', before: 50, counted: 45, diff: -5 },   // хоёр удаа бичсэн нь нийлнэ
      { ner: 'Ромашка', before: 12, counted: 12, diff: 0 },
      { ner: 'Лили', before: 7, counted: 9, diff: 2 },
    ],
    unmatched: ['Хх'],
    notCounted: ['Башир'],
  });
});
