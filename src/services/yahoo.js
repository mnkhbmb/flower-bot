// Хаан банкны мэдэгдэл өөр хүний Yahoo шуудан руу ирдэг тул тэндээс шууд уншина.
// Зөвхөн Хаан банкнаас ирсэн, ДЭЛГҮҮРИЙН дансны (YAHOO_SHOP_ACCOUNT) гүйлгээг авна —
// тэр хүний хувийн дансны гүйлгээ болон бусад захидлыг огт хадгалахгүй, бүртгэхгүй.
// Шууданг зөвхөн уншина (readOnly): "уншсан" тэмдэг тавихгүй, юу ч устгахгүй.
import { startMailPoller } from './mailPoller.js';
import { mentionsAccount } from './bankParser.js';

export function startYahooPoller() {
  const user = process.env.YAHOO_USER;
  const pass = process.env.YAHOO_APP_PASSWORD;
  const account = process.env.YAHOO_SHOP_ACCOUNT;
  const from = process.env.YAHOO_FROM || 'khanbank';
  if (!user || !pass) {
    console.log('ℹ️ Yahoo poller идэвхгүй (YAHOO_USER / YAHOO_APP_PASSWORD тохируулаагүй)');
    return;
  }
  if (!account) {
    // Дансаар шүүхгүй бол хувийн дансны гүйлгээ ч орно — тиймээс огт эхлүүлэхгүй
    console.error('❌ Yahoo poller эхэлсэнгүй: YAHOO_SHOP_ACCOUNT (дэлгүүрийн Хаан дансны дугаар) тохируулаагүй');
    return;
  }
  console.log(`📧 Yahoo poller эхэллээ — "${from}"-аас ирсэн, ${account.slice(-4)}-өөр төгссөн дансны гүйлгээ`);
  startMailPoller({
    name: 'Yahoo', host: 'imap.mail.yahoo.com', user, pass,
    folder: process.env.YAHOO_FOLDER || 'INBOX',
    stateKey: 'yahoo_last_uid',
    search: { from },
    accept: text => mentionsAccount(text, account),
    overrides: { bank: 'Хаан банк' },
  });
}
