// Банкны гүйлгээг ангилж, "Гүйлгээ" tab-д хадгалаад, Discord руу мэдэгдэнэ.
// Ажилтанд өгсөн урьдчилгаа бол цалингаас нь автоматаар хасна ("Зээл" tab-д бичнэ).
import { categorize } from '../config/bankCategories.js';
import { saveTransaction, saveZeel, getWorkerNames, getCounterpartyPerson } from './sheets.js';
import { notifyTransaction, salaryPeople } from './discord.js';

// tx: { bank, txType, amount, description, balance, date, time, key, ownTransfer, parsed, subject }
export async function recordTransaction(tx) {
  let people = salaryPeople();
  try {
    people = [...new Set([...people, ...(await getWorkerNames())])];
  } catch (err) {
    console.error('Ажилтны нэр унших алдаа:', err.message);
  }

  // Энэ хүлээн авагчийг өмнө нь Discord дээр ажилтантай холбосон бол түүнийг ашиглана
  let known = null;
  if (tx.counterparty && tx.txType === 'Зарлага') {
    known = await getCounterpartyPerson(tx.counterparty).catch(() => null);
  }
  const { category, person } = categorize(tx, people, known);
  const saved = await saveTransaction({ ...tx, category, person });
  if (saved.duplicate) {
    console.log(`⏭ Давхар гүйлгээ алгаслаа: ${tx.key}`);
    return;
  }

  // Урьдчилгаа → цалингаас хасна. Discord дээрх товчоор буцааж болно.
  let advance = null;
  if (category === 'Урьдчилгаа' && person && tx.amount > 0) {
    await saveZeel({
      name: person,
      amount: tx.amount,
      date: tx.date,
      note: `Банк: ${tx.description || '—'} [tx:${saved.tx.row}]`,
    });
    advance = person;
  }

  await notifyTransaction({ ...saved.tx, parsed: tx.parsed, subject: tx.subject, advance });
}
