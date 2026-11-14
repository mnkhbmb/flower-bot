// Огноо, цалингийн хугацааны туслах — бүгд "YYYY-MM-DD" мөрөөр, Улаанбаатарын цагаар.

// Улаанбаатарын өнөөдөр (UTC+8)
export function ubToday(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// Сар/өдөр хэтэрвэл дараагийн/өмнөх сар руу шилжинэ (ymd(2026, 13, 10) → 2027-01-10)
export function ymd(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function addDays(date, n) {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

// Цалингийн хугацаа: 11 ~ 25 (25-нд олгоно), 26 ~ дараа сарын 10 (10-нд олгоно).
// Хил давхцахгүй — 10, 25-ны өдөр зөвхөн нэг хугацаанд тоологдоно.
export function salaryPeriodFor(date) {
  const [y, m, d] = date.split('-').map(Number);
  if (d >= 11 && d <= 25) return { from: ymd(y, m, 11), to: ymd(y, m, 25) };
  if (d >= 26) return { from: ymd(y, m, 26), to: ymd(y, m + 1, 10) };
  return { from: ymd(y, m - 1, 26), to: ymd(y, m, 10) };
}
