// Банкны гүйлгээг утгаар нь ангилах дүрэм (цэцгийн дэлгүүрт тааруулсан).
// Discord дээрх цэснээс ангиллыг гараар сольж болно — энд зөвхөн эхний таамаг.

export const EXPENSE_CATEGORIES = [
  'Бараа таталт', 'Урьдчилгаа', 'Цалин', 'Түрээс', 'Баглаа боодол', 'Хүргэлт, тээвэр',
  'Интернет, утас', 'Татвар, НД', 'Банкны шимтгэл', 'Өөрийн данс хооронд', 'Бусад зарлага',
];
export const INCOME_CATEGORIES = ['Борлуулалт', 'Буцаалт', 'Өөрийн данс хооронд', 'Бусад орлого'];

// Цалинтай холбоогүй ангилал — дээрээс доош эрэмбээр шалгана
const EXPENSE_RULES = [
  { cat: 'Банкны шимтгэл', words: ['шимтгэл', 'shimtgel', 'commission', 'fee'] },
  { cat: 'Татвар, НД', words: ['татвар', 'tatvar', 'ндш', 'ndsh', 'нийгмийн даатгал', 'ebarimt', 'и-баримт', 'хураамж', 'торгууль'] },
  { cat: 'Түрээс', words: ['түрээс', 'turees', 'rent', 'плаза', 'plaza', 'их найд', 'ikh naid'] },
  { cat: 'Баглаа боодол', words: ['цаас', 'tsaas', 'тууз', 'tuuz', 'боодол', 'boodol', 'уут', 'хайрцаг', 'сагс'] },
  { cat: 'Бараа таталт', words: ['цэцэг', 'tsetseg', 'flower', 'бараа', 'baraa', 'карго', 'cargo', 'kargo', 'taobao', '1688',
    'хятад', 'hyatad', 'yuan', 'юань', 'alipay', 'wechat', 'бөөний', 'boonii', 'таталт', 'tatalt'] },
  { cat: 'Хүргэлт, тээвэр', words: ['хүргэлт', 'hurgelt', 'khurgelt', 'такси', 'taxi', 'ubcab', 'тээвэр', 'delivery', 'жолооч', 'shuudan', 'шуудан'] },
  { cat: 'Интернет, утас', words: ['unitel', 'mobicom', 'skytel', 'gmobile', 'g-mobile', 'univision', 'интернет', 'internet', 'нэгж', 'дата'] },
];

const INCOME_RULES = [
  { cat: 'Буцаалт', words: ['буцаа', 'butsaa', 'refund', 'return'] },
];

const SALARY_WORDS = ['цалин', 'tsalin', 'salary'];
const ADVANCE_WORDS = ['урьдчилгаа', 'uridchilgaa', 'зээл', 'zeel', 'advance'];

// Нэрийг латин болгох (банкны утгыг ихэвчлэн латинаар бичдэг: "amina uridchilgaa")
const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: '', ы: 'ii', ь: 'i', э: 'e', ю: 'yu', я: 'ya' };
function variants(name) {
  const n = name.toLowerCase().trim();
  const lat = [...n].map(c => LAT[c] ?? c).join('');
  // ө/ү-г "o"-гоор, х-г "kh"-аар бичих нь ч түгээмэл
  const alt = [...n].map(c => (c === 'ө' ? 'o' : c === 'х' ? 'kh' : LAT[c] ?? c)).join('');
  return [...new Set([n, lat, alt])].filter(v => v.length >= 3);
}

// Утган дотор бүтэн үгээр таарах эсэх (JS-ийн \b кирилл дээр ажилладаггүй тул өөрсдөө)
function hasWord(text, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-zа-яөүё])${esc}`, 'i').test(text);
}

// Ажилтны нэр утганд байгаа эсэх → тэр нэр, эс бол null
export function findPerson(description, people) {
  const d = (description || '').toLowerCase();
  for (const p of people) {
    if (variants(p).some(v => hasWord(d, v))) return p;
  }
  return null;
}

// Цалингийн өдөр (10, 25) орчим уу — тэр үед нэртэй шилжүүлэг цалин гэж үзнэ
function nearPayday(date) {
  const day = Number(String(date || '').slice(8, 10));
  return [9, 10, 11, 12, 24, 25, 26, 27].includes(day);
}

// { txType, description, counterparty, date, ownTransfer } → { category, person }
// person — Цалин/Урьдчилгаа үед хэнд өгснийг заана (Урьдчилгаа бол цалингаас нь хасна).
// knownPerson — өмнө нь Discord дээр энэ харилцагчийг сонгосон бол тэр ажилтан.
export function categorize(tx, people = [], knownPerson = null) {
  const d = (tx.description || '').toLowerCase();
  if (tx.ownTransfer) return { category: 'Өөрийн данс хооронд', person: null };

  if (tx.txType === 'Орлого') {
    const rule = INCOME_RULES.find(r => r.words.some(w => hasWord(d, w)));
    return { category: rule ? rule.cat : 'Борлуулалт', person: null };
  }

  // Утгад нэр бичдэггүй тул хүлээн авагчийн нэрээр ч хайна
  const person = knownPerson || findPerson(`${d} ${tx.counterparty || ''}`, people);
  if (person) {
    const advance = ADVANCE_WORDS.some(w => d.includes(w));
    const salary = SALARY_WORDS.some(w => d.includes(w));
    if (advance || (!salary && !nearPayday(tx.date))) return { category: 'Урьдчилгаа', person };
    return { category: 'Цалин', person };
  }
  if (SALARY_WORDS.some(w => d.includes(w))) return { category: 'Цалин', person: null };

  const rule = EXPENSE_RULES.find(r => r.words.some(w => hasWord(d, w)));
  return { category: rule ? rule.cat : 'Бусад зарлага', person: null };
}
