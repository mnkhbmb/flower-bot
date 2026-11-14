import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeelAmount, loanBalances, accountBalances, parseRepayText } from '../src/utils/ledger.js';

test('зээлийн дүн: буцаалт сөрөг, мөнгөн тэмдэг, бутархай', () => {
  assert.equal(zeelAmount('50,000'), 50000);
  assert.equal(zeelAmount('-50,000'), -50000);
  assert.equal(zeelAmount('(50,000)'), -50000);
  assert.equal(zeelAmount('₮40,000.00'), 40000);
  assert.equal(zeelAmount(-30000), -30000);
  assert.equal(zeelAmount(''), 0);
});

test('зээлийн үлдэгдэл: цалинтай хүнийх зөвхөн одоогийн хугацаанд', () => {
  const rows = [
    { date: '2026-10-05', name: 'Амина', amount: 100000 },  // өмнөх цалингаас хасагдсан
    { date: '2026-10-26', name: 'Амина', amount: 80000 },
    { date: '2026-10-28', name: 'Амина', amount: -30000 },
    { date: '2026-09-01', name: 'Заяа', amount: 165000 },   // ажилчин биш — хуучин ч үлдэнэ
    { date: '2026-10-30', name: 'заяа', amount: -57000 },   // нэрний том жижиг үсэг хамаагүй
    { date: '2026-10-30', name: 'Бат', amount: 40000 },
    { date: '2026-10-30', name: 'Бат', amount: -40000 },    // бүрэн төлсөн — жагсаалтад орохгүй
  ];
  assert.deepEqual(loanBalances(rows, '2026-10-26', ['Амина', 'Туяа']), [
    { name: 'Амина', balance: 50000, onSalary: true, since: '2026-10-26' },
    { name: 'Заяа', balance: 108000, onSalary: false, since: '2026-09-01' },
  ]);
});

test('дансны үлдэгдэл: тохируулсан мөчөөс хойших гүйлгээг л тоолно', () => {
  const tx = (date, time, account, txType, amount, balance = null) => ({ date, time, account, txType, amount, balance });
  const txs = [
    tx('2026-11-10', '10:00', 'Данс', 'Зарлага', 50000),          // тохируулахаас өмнө
    tx('2026-11-10', '', 'Данс', 'Зарлага', 7000),                // цаггүй, тэр өдөр — өмнө гэж үзнэ
    tx('2026-11-10', '15:30', 'Данс', 'Зарлага', 57000),
    tx('2026-11-11', '09:00', 'Данс', 'Орлого', 200000, 1143000),
    tx('2026-11-11', '11:00', 'Бэлэн', 'Зарлага', 30000),        // өөр данс
  ];
  const [b] = accountBalances([{ account: 'Данс', base: 1000000, since: '2026-11-10 14:00' }], txs, t => t.account);
  assert.equal(b.balance, 1143000);
  assert.equal(b.in, 200000);
  assert.equal(b.out, 57000);
  assert.equal(b.count, 2);
  // Банкны бичсэн үлдэгдэл бидний тооцоотой таарч байна
  assert.deepEqual(b.bank, { balance: 1143000, computed: 1143000, date: '2026-11-11', time: '09:00' });
});

test('дансны үлдэгдэл: банкны дүнтэй зөрвөл тэр мөчийн тооцоог хадгална', () => {
  const txs = [{ date: '2026-11-10', time: '12:00', account: 'ХасБанк', txType: 'Орлого', amount: 67320, balance: 600000 }];
  const [b] = accountBalances([{ account: 'ХасБанк', base: 500000, since: '2026-11-09 09:00' }], txs, t => t.account);
  assert.equal(b.balance, 567320);
  assert.equal(b.bank.balance - b.bank.computed, 32680);
});

test('буцаалтын reply-ийн дүн', () => {
  assert.deepEqual(parseRepayText('50000'), { amount: 50000, note: '' });
  assert.deepEqual(parseRepayText('50,000'), { amount: 50000, note: '' });
  assert.deepEqual(parseRepayText('50 000 бэлнээр'), { amount: 50000, note: 'бэлнээр' });
  assert.deepEqual(parseRepayText('57к'), { amount: 57000, note: '' });
  assert.deepEqual(parseRepayText('57K'), { amount: 57000, note: '' });
  assert.deepEqual(parseRepayText('1,250,000'), { amount: 1250000, note: '' });
  assert.deepEqual(parseRepayText('бүгд'), { amount: 'all', note: '' });
  assert.deepEqual(parseRepayText('BUGD'), { amount: 'all', note: '' });
  // Ердийн яриа буцаалт болохгүй
  assert.equal(parseRepayText('165-57'), null);
  assert.equal(parseRepayText('ok'), null);
  assert.equal(parseRepayText(''), null);
});
