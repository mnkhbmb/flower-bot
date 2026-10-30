// Хаан банкны мэдэгдэл өөр хүний Yahoo шуудан руу ирдэг тул тэндээс шууд уншина.
// Зөвхөн Хаан банкнаас ирсэн, ДЭЛГҮҮРИЙН дансуудын (YAHOO_SHOP_ACCOUNT) гүйлгээг авна —
// тэр хүний хувийн дансны гүйлгээ болон бусад захидлыг огт хадгалахгүй, бүртгэхгүй.
// Жнь YAHOO_SHOP_ACCOUNT="5011111111:Данс,5022222222:Бэлэн" (шилжүүлэг авдаг, бэлэн тушаадаг данс).
// Шууданг зөвхөн уншина (readOnly): "уншсан" тэмдэг тавихгүй, юу ч устгахгүй.
import { startMailPoller } from './mailPoller.js';
import { mentionsAccount, shopAccounts, parseKhan, khanDirection, khanParties } from './bankParser.js';

export function startYahooPoller() {
  const user = process.env.YAHOO_USER;
  const pass = process.env.YAHOO_APP_PASSWORD;
  const accounts = shopAccounts();
  // Илгээгчийн хаягаар шүүх нь заавал биш (Хаан банкны хаяг "khanbank" гэж агуулдаггүй байсан).
  // Хоосон бол бүх шинэ и-мэйлийг уншаад ДАНСНЫ ДУГААРААР шүүнэ — бусад захидал хадгалагдахгүй.
  const from = (process.env.YAHOO_FROM || '').trim();
  if (!user || !pass) {
    console.log('ℹ️ Yahoo poller идэвхгүй (YAHOO_USER / YAHOO_APP_PASSWORD тохируулаагүй)');
    return;
  }
  if (!accounts.length) {
    // Дансаар шүүхгүй бол хувийн дансны гүйлгээ ч орно — тиймээс огт эхлүүлэхгүй
    console.error('❌ Yahoo poller эхэлсэнгүй: YAHOO_SHOP_ACCOUNT (дэлгүүрийн Хаан дансны дугаар) тохируулаагүй');
    return;
  }
  console.log(`📧 Yahoo poller эхэллээ — ${from ? `"${from}"-аас ирсэн, ` : ''}${accounts.map(a => `${a.label} (*${a.id.slice(-4)})`).join(', ')} дансны гүйлгээ`);
  startMailPoller({
    name: 'Yahoo', host: 'imap.mail.yahoo.com', user, pass,
    folder: process.env.YAHOO_FOLDER || 'INBOX',
    stateKey: 'yahoo_last_uid',
    search: from ? { from } : undefined,
    accept: text => accounts.some(a => mentionsAccount(text, a.id)),
    // Аль данснаас/данс руу болсныг тэмдэглэнэ — тулгалт, данс тус бүрийн тайланд
    // Хаан банкны баримтыг Хаан банкны задлагчаар уншиж (дотор нь "Golomt Bank" гэх мэт өөр банкны
    // нэр байж болно), орлого/зарлагыг манай данс Дт/From эсвэл Кт/To хэсэгт байгаагаар тогтооно.
    overrides: text => {
      const acc = accounts.find(a => mentionsAccount(text, a.id));
      const khan = parseKhan(text);
      const txType = khanDirection(text, acc?.id) || khan.txType;
      // Харилцагч = мөнгө хүлээн авагч (зарлага) эсвэл илгээгч (орлого) — цалинг хэнд өгснийг танихад
      const parties = khanParties(text);
      const outgoing = txType === 'Зарлага';
      const name = outgoing ? parties.to : parties.from;
      const number = outgoing ? parties.toAcc : parties.fromAcc;
      // Нөгөө тал нь дэлгүүрийн өөр данс бол нэрээр нь харуулна
      const other = accounts.find(a => a !== acc && mentionsAccount(text, a.id));
      const counterparty = other
        ? `Өөрийн данс: ${other.label} (*${other.id.slice(-4)})`
        : [name, number && `*${number.slice(-4)}`].filter(Boolean).join(' · ');
      if (!name) {
        // Нэр уншигдсангүй — баримтын бүтцийг харахад (дэлгүүрийн гүйлгээ, тоог далдалсан)
        console.log('Yahoo: харилцагчийн нэр олдсонгүй. Баримт:', text.replace(/\d{4,}/g, '####').replace(/\s+/g, ' ').slice(0, 700));
      }
      return { ...khan, txType, account: acc?.label || '', counterparty };
    },
  });
}
