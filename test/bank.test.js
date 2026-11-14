import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKhan, khanDirection, khanParties, mentionsAccount, isOwnTransfer, parseAccountList, parseXacPdf, extractBalance,
} from '../src/services/bankParser.js';
import { categorize, findPerson } from '../src/config/bankCategories.js';

// Зохиомол дансны дугаартай Хаан банкны шилжүүлгийн баримт
const SHOP = '5099992668';
const OTHER = '5088881234';
const KHAN_RECEIPT = `Шилжүүлгийн баримт
Журналын дугаар: 123456789
Дт / From
Данс: ${SHOP}
МӨНХБЯМБА САРУУЛ
Кт / To
Данс: ${OTHER}
Д*********Н ЗОЛЗАЯА
Дүн: 57,000.00 MNT
/ Тавин долоон мянган төгрөг /
Гүйлгээний утга / Transaction description: zaya egch zeel`;

test('Хаан банк: чиглэл нь манай данс Дт эсвэл Кт хэсэгт байгаагаар', () => {
  assert.equal(khanDirection(KHAN_RECEIPT, SHOP), 'Зарлага');
  assert.equal(khanDirection(KHAN_RECEIPT, OTHER), 'Орлого');
  assert.equal(khanDirection(KHAN_RECEIPT, '5000000000'), null);
  // Кирилл, латин үсэг холилдсон "Kт /" тэмдэг
  assert.equal(khanDirection(KHAN_RECEIPT.replace('Кт /', 'Kт /'), SHOP), 'Зарлага');
});

test('Хаан банк: илгээгч, хүлээн авагч, дансны дугаар (журналын дугаарыг алгасна)', () => {
  assert.deepEqual(khanParties(KHAN_RECEIPT), {
    from: 'МӨНХБЯМБА САРУУЛ', to: 'Д*********Н ЗОЛЗАЯА', fromAcc: SHOP, toAcc: OTHER,
  });
  assert.deepEqual(khanParties('Кт тэмдэггүй текст'), { from: '', to: '', fromAcc: '', toAcc: '' });
});

test('Хаан банк: дүн ба утга', () => {
  const t = parseKhan(KHAN_RECEIPT);
  assert.equal(t.bank, 'Хаан банк');
  assert.equal(t.amount, 57000);
  assert.equal(t.description, 'zaya egch zeel');
});

test('дансны дугаар бүтэн болон далдалсан хэлбэрээр', () => {
  assert.ok(mentionsAccount(`данс ${SHOP}`, SHOP));
  assert.ok(mentionsAccount('данс 509****668', SHOP));
  assert.ok(mentionsAccount('данс ****2668', SHOP));
  assert.ok(!mentionsAccount('данс ****26681', SHOP));
  assert.ok(!mentionsAccount('данс 5011113352', SHOP));
  assert.ok(!mentionsAccount('anything', '123'));
});

test('дэлгүүрийн хоёр данс хоорондын шилжүүлэг', () => {
  const saved = process.env.YAHOO_SHOP_ACCOUNT;
  process.env.YAHOO_SHOP_ACCOUNT = `${SHOP}:Данс,${OTHER}:Бэлэн`;
  try {
    assert.ok(isOwnTransfer(KHAN_RECEIPT));
    assert.ok(!isOwnTransfer(`Данс: ${SHOP} → 5077770000`));
  } finally {
    if (saved === undefined) delete process.env.YAHOO_SHOP_ACCOUNT; else process.env.YAHOO_SHOP_ACCOUNT = saved;
  }
});

test('дансны жагсаалт задлах', () => {
  assert.deepEqual(parseAccountList(`${SHOP}:Данс, ${OTHER}`), [
    { id: SHOP, label: 'Данс' },
    { id: OTHER, label: '*1234' },
  ]);
  assert.deepEqual(parseAccountList(''), []);
});

test('ХасБанк: орлого/зарлага, эхний дүн, утга', () => {
  const income = 'ОРЛОГЫН ГҮЙЛГЭЭ\nГүйлгээний дүн: 67,320.00\nГүйлгээний утга: POS 0412\nГүйлгээ хийсэн огноо';
  assert.deepEqual(parseXacPdf(income), { bank: 'ХасБанк', txType: 'Орлого', amount: 67320, description: 'POS 0412' });
  const expense = 'Дүн: 120,000.00\nГүйлгээний утга: tsetseg tatalt\nГүйлгээний шимтгэл\nДүн: 100.00';
  assert.deepEqual(parseXacPdf(expense), { bank: 'ХасБанк', txType: 'Зарлага', amount: 120000, description: 'tsetseg tatalt' });
});

test('и-мэйлээс үлдэгдэл', () => {
  assert.equal(extractBalance('Үлдэгдэл: 1,143,000.00 MNT'), 1143000);
  assert.equal(extractBalance('үлдэгдэлгүй текст'), null);
});

test('ангилал: ажилтан, зээл, цалин, борлуулалт', () => {
  const people = ['Туяа', 'Амина', 'Саруул', 'Лулу'];
  const cat = (txType, description, extra = {}) =>
    categorize({ txType, description, date: '2026-10-15', ...extra }, people);
  assert.deepEqual(cat('Зарлага', 'zaya egch zeel'), { category: 'Зээл өгсөн', person: null });
  assert.deepEqual(cat('Зарлага', 'amina zeel'), { category: 'Урьдчилгаа', person: 'Амина' });
  assert.deepEqual(cat('Зарлага', 'amina', { date: '2026-10-25' }), { category: 'Цалин', person: 'Амина' });
  assert.deepEqual(cat('Зарлага', 'цэцгийн дэлгүүр цалин'), { category: 'Цалин', person: null });
  assert.deepEqual(cat('Зарлага', 'zaya egch 165-57g xiiv'), { category: 'Бусад зарлага', person: null });
  assert.deepEqual(cat('Зарлага', 'turees tolbor'), { category: 'Түрээс', person: null });
  assert.deepEqual(cat('Орлого', 'zeel butsaalt'), { category: 'Зээл буцаалт', person: null });
  assert.deepEqual(cat('Орлого', 'butsaalt'), { category: 'Буцаалт', person: null });
  assert.deepEqual(cat('Орлого', 'POS'), { category: 'Борлуулалт', person: null });
  assert.deepEqual(cat('Зарлага', 'x', { ownTransfer: true }), { category: 'Өөрийн данс хооронд', person: null });
  // Хүлээн авагчийн нэрээр таних
  assert.deepEqual(cat('Зарлага', 'tsetsgiin delguur', { counterparty: 'Б*****Н АМИНА', date: '2026-10-25' }),
    { category: 'Цалин', person: 'Амина' });
});

test('нэр таних: кирилл нэрийг латинаар бичсэн утгаас, бүтэн үгээр', () => {
  assert.equal(findPerson('tuyaa uridchilgaa', ['Туяа']), 'Туяа');
  assert.equal(findPerson('Түрээс', ['Туяа']), null);
});
