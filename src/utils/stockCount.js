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
