// Хаан банкны мэдэгдэл өөр хүний Yahoo шуудан руу ирдэг тул тэндээс шууд уншина.
// Зөвхөн Хаан банкнаас ирсэн, ДЭЛГҮҮРИЙН дансуудын (YAHOO_SHOP_ACCOUNT) гүйлгээг авна —
// тэр хүний хувийн дансны гүйлгээ болон бусад захидлыг огт хадгалахгүй, бүртгэхгүй.
// Жнь YAHOO_SHOP_ACCOUNT="5011111111:Данс,5022222222:Бэлэн" (шилжүүлэг авдаг, бэлэн тушаадаг данс).
// Шууданг зөвхөн уншина (readOnly): "уншсан" тэмдэг тавихгүй, юу ч устгахгүй.
import { startMailPoller } from './mailPoller.js';
import { mentionsAccount, shopAccounts } from './bankParser.js';

export function startYahooPoller() {
  const user = process.env.YAHOO_USER;
  const pass = process.env.YAHOO_APP_PASSWORD;
  const accounts = shopAccounts();
  const from = process.env.YAHOO_FROM || 'khanbank';
  if (!user || !pass) {
    console.log('ℹ️ Yahoo poller идэвхгүй (YAHOO_USER / YAHOO_APP_PASSWORD тохируулаагүй)');
    return;
  }
  if (!accounts.length) {
    // Дансаар шүүхгүй бол хувийн дансны гүйлгээ ч орно — тиймээс огт эхлүүлэхгүй
    console.error('❌ Yahoo poller эхэлсэнгүй: YAHOO_SHOP_ACCOUNT (дэлгүүрийн Хаан дансны дугаар) тохируулаагүй');
    return;
  }
  console.log(`📧 Yahoo poller эхэллээ — "${from}"-аас ирсэн, ${accounts.map(a => `${a.label} (*${a.id.slice(-4)})`).join(', ')} дансны гүйлгээ`);
  startMailPoller({
    name: 'Yahoo', host: 'imap.mail.yahoo.com', user, pass,
    folder: process.env.YAHOO_FOLDER || 'INBOX',
    stateKey: 'yahoo_last_uid',
    search: { from },
    accept: text => accounts.some(a => mentionsAccount(text, a.id)),
    // Аль данснаас/данс руу болсныг тэмдэглэнэ — тулгалт, данс тус бүрийн тайланд
    overrides: text => ({
      bank: 'Хаан банк',
      account: (accounts.find(a => mentionsAccount(text, a.id)) || {}).label || '',
    }),
  });
}
