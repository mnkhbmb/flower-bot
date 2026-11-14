// Зээл, дансны үлдэгдлийн тооцоо — Sheets-ээс уншсан мөрүүд дээр ажилладаг цэвэр функцууд.

// "Зээл" tab-ийн дүн: зээл эерэг, буцаалт сөрөг ("-50,000")
export function zeelAmount(value) {
  const s = String(value || '');
  const n = Number(s.replace(/[^\d.]/g, '')) || 0;
  return /[-(]/.test(s) ? -n : n;
}

// [{ date, name, amount }] → төлөгдөөгүй зээл [{ name, balance, onSalary, since }].
// Цалинтай хүний зээл цалингаас бүтнээрээ хасагддаг тул зөвхөн одоогийн хугацааных (periodFrom-оос)
// үлдэнэ; цалингаас хасагддаггүй хүнийх буцаатал хэвээр үлдэнэ.
export function loanBalances(rows, periodFrom, salaried = []) {
  const onSalary = new Set(salaried.map(n => n.trim().toLowerCase()));
  const loans = new Map();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (onSalary.has(key) && r.date < periodFrom) continue;
    const loan = loans.get(key) || { name: r.name, balance: 0, onSalary: onSalary.has(key), since: r.date };
    loan.balance += r.amount;
    if (r.date < loan.since) loan.since = r.date;
    loans.set(key, loan);
  }
  return [...loans.values()].filter(l => l.balance > 0);
}

// bases: [{ account, base, since: "YYYY-MM-DD HH:MM" }], txs: rowToTx-ийн мөрүүд, keyOf: tx → данс.
// → [{ ...base, balance, in, out, count, bank }]. bank — сүүлийн гүйлгээний и-мэйлд банк өөрөө бичсэн
// үлдэгдэл ба тэр мөчид бидний тооцоолсон дүн.
export function accountBalances(bases, txs, keyOf) {
  return bases.map(b => {
    const out = { ...b, balance: b.base, in: 0, out: 0, count: 0, bank: null };
    for (const tx of txs) {
      // Цаггүй гүйлгээ тохируулсан өдрөө орсон бол аль хэдийн үлдэгдэлд орсон гэж үзнэ
      if (keyOf(tx) !== b.account || `${tx.date} ${tx.time}` <= b.since) continue;
      if (tx.txType === 'Орлого') { out.balance += tx.amount; out.in += tx.amount; }
      else { out.balance -= tx.amount; out.out += tx.amount; }
      out.count++;
      if (tx.balance != null) out.bank = { balance: tx.balance, computed: out.balance, date: tx.date, time: tx.time };
    }
    return out;
  });
}

// Зээлийн мессежид бичсэн reply → { amount, note }: "50000", "50,000 бэлнээр", "57к", "бүгд"
export function parseRepayText(text) {
  const t = String(text || '').trim();
  if (/^(бүгд|бүх|bugd|buh)$/i.test(t)) return { amount: 'all', note: '' };
  const m = t.match(/^(\d{1,3}(?:[,. ]\d{3})+|\d+)\s*([kк])?(?:\s+(.+))?$/is);
  if (!m) return null;
  return { amount: Number(m[1].replace(/\D/g, '')) * (m[2] ? 1000 : 1), note: (m[3] || '').trim() };
}
