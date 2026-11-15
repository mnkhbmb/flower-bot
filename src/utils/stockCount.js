// Агуулахын тооллогын цэвэр логик (Sheets/Discord дуудлагагүй).

// "Са-45 Ро-12", "са 45, ро 12", "мини сарнай: 8ш" → [{ tovch, too }]
export function parseCountText(text) {
  const out = [];
  const re = /([\p{L}\/]+(?:[ \t]+[\p{L}\/]+)*)[ \t]*[-:=]?[ \t]*(\d+)(?:[ \t]*ш(?![\p{L}]))?/gu;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    out.push({ tovch: m[1].trim(), too: Number(m[2]) });
  }
  return out;
}

// stock: [{ key, ner, too }] — агуулахын мөрүүд (too = бүртгэл дээрх одоогийн тоо).
// counted: parseCountText-ийн гаралт. match(tovch) → тохирох мөрийн key эсвэл null.
// Нэг барааг хоёр газар тоолж хоёр удаа бичвэл нийлбэрээр авна.
export function buildStockCount(stock, counted, match) {
  const keys = new Set(stock.map(s => s.key));
  const sums = new Map();
  const unmatched = [];
  for (const { tovch, too } of counted) {
    const key = match(tovch);
    if (key == null || !keys.has(key)) {
      if (!unmatched.includes(tovch)) unmatched.push(tovch);
      continue;
    }
    sums.set(key, (sums.get(key) || 0) + too);
  }
  const lines = stock
    .filter(s => sums.has(s.key))
    .map(s => ({ ner: s.ner, before: s.too, counted: sums.get(s.key), diff: sums.get(s.key) - s.too }));
  const notCounted = stock.filter(s => !sums.has(s.key) && s.ner).map(s => s.ner);
  return { lines, unmatched, notCounted };
}

// Агуулахын нэр ерөнхий нэрээр биш "Удвал Chrysanthemum", "Carola rose-Red" маягаар бичигдсэн үед:
// нэрийн бүтэн үг нь хувилбаруудын аль нэгтэй таарвал 2 (нэрийн эхэнд) эсвэл 1 (дунд нь), үгүй бол 0.
// 3-аас богино хувилбарыг ("м", "са") тооцохгүй — санамсаргүй таарахаас сэргийлнэ.
export function nameMatchScore(name, variants) {
  const words = String(name || '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (!words.length) return 0;
  const padded = ' ' + words.join(' ') + ' ';
  let best = 0;
  for (const v of variants) {
    const vw = String(v || '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).join(' ');
    if (vw.length < 3) continue;
    const at = padded.indexOf(' ' + vw + ' ');
    if (at === 0) return 2;
    if (at > 0) best = 1;
  }
  return best;
}
