// Банкны гүйлгээний и-мэйлээс мэдээлэл салгах.
// "bank-transaction" label-тай и-мэйл бүрийг зардал/гүйлгээ гэж үзнэ.
// Дээж и-мэйлээр regex-ийг сайжруулж болно.

const BANKS = [
  { name: 'Хаан банк', match: /khan|хаан/i },
  { name: 'XacBank',   match: /xac|khas|хас/i },
  { name: 'Голомт',    match: /golomt|голомт/i },
];

// Дүн олох: "50,000.00₮" / "50000 MNT" / "-50,000 төг" гэх мэт
function extractAmount(text) {
  if (!text) return null;
  const re = /(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)\s*(?:₮|MNT|төг)/i;
  const m = text.match(re);
  if (!m) return null;
  const num = Number(m[1].replace(/[,\s]/g, ''));
  return Number.isFinite(num) ? Math.abs(num) : null;
}

// Үлдэгдэл олох (сонголтоор): "Үлдэгдэл: 1,200,000₮"
function extractBalance(text) {
  if (!text) return null;
  const m = text.match(/(?:үлдэгдэл|balance)[^\d-]*(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/i);
  if (!m) return null;
  const num = Number(m[1].replace(/[,\s]/g, ''));
  return Number.isFinite(num) ? num : null;
}

// Орлого/зарлага ялгах — тодорхойгүй бол зарлага гэж үзнэ (label нь зардлынх)
function detectType(hay) {
  if (/орлого|credit|орлоо|нэмэгдсэн|\+\s*[\d,]/i.test(hay)) return 'Орлого';
  return 'Зарлага';
}

// Тэмдэглэл/утга гаргах — гүйлгээний утга байвал авна, эс бөгөөс subject
function extractDescription(text, subject) {
  if (text) {
    const m = text.match(/(?:утга|гүйлгээний утга|description|narration)[:\s]+(.{3,120})/i);
    if (m) {
      // Мөр солих, эсвэл "Үлдэгдэл/Balance" хүрэхээс өмнө таслана
      return m[1]
        .split('\n')[0]
        .split(/үлдэгдэл|balance/i)[0]
        .replace(/[.\s]+$/, '')
        .trim();
    }
  }
  return (subject || '').trim() || '—';
}

// Гол функц — и-мэйлээс гүйлгээ гаргах. Салгаж чадахгүй бол raw мэдээлэл буцаана.
export function parseBankEmail({ from, subject, text, date }) {
  const hay = `${from} ${subject} ${text}`;
  const bank = BANKS.find(b => b.match.test(hay))?.name || 'Банк';

  const amount = extractAmount(text) ?? extractAmount(subject);
  const txType = detectType(hay);
  const description = extractDescription(text, subject);
  const balance = extractBalance(text);

  return {
    bank,
    amount,                 // null байвал Discord дээр "тодорхойгүй" гэж харагдана
    txType,
    date: date ? new Date(date).toISOString().slice(0, 10) : '',
    description,
    balance,
    parsed: amount != null,  // regex дүнг олсон эсэх
    subject: (subject || '').trim(),
  };
}
