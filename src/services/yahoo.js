// Хаан банкны мэдэгдэл өөр хүний Yahoo шуудан руу ирдэг тул тэндээс шууд уншина.
// Зөвхөн Хаан банкнаас ирсэн, ДЭЛГҮҮРИЙН дансны (YAHOO_SHOP_ACCOUNT) гүйлгээг авна —
// тэр хүний хувийн дансны гүйлгээ болон бусад захидлыг огт хадгалахгүй, бүртгэхгүй.
// Шууданг зөвхөн уншина (readOnly): "уншсан" тэмдэг тавихгүй, юу ч устгахгүй.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { mentionsAccount } from './bankParser.js';
import { extractText, buildTx } from './gmail.js';
import { recordTransaction } from './bankTx.js';
import { getSetting, setSetting } from './sheets.js';

const USER = process.env.YAHOO_USER;
const PASS = process.env.YAHOO_APP_PASSWORD;
const SHOP_ACCOUNT = process.env.YAHOO_SHOP_ACCOUNT;
const FROM = process.env.YAHOO_FROM || 'khanbank';
const FOLDER = process.env.YAHOO_FOLDER || 'INBOX';
const POLL_MS = 2 * 60 * 1000;
const STATE_KEY = 'yahoo_last_uid';   // "Тохиргоо" tab — хаана хүртэл уншсан

let lastUid = null;

export function startYahooPoller() {
  if (!USER || !PASS) {
    console.log('ℹ️ Yahoo poller идэвхгүй (YAHOO_USER / YAHOO_APP_PASSWORD тохируулаагүй)');
    return;
  }
  if (!SHOP_ACCOUNT) {
    // Дансаар шүүхгүй бол хувийн дансны гүйлгээ ч орно — тиймээс огт эхлүүлэхгүй
    console.error('❌ Yahoo poller эхэлсэнгүй: YAHOO_SHOP_ACCOUNT (дэлгүүрийн Хаан дансны дугаар) тохируулаагүй');
    return;
  }
  console.log(`📧 Yahoo poller эхэллээ — "${FROM}"-аас ирсэн, ${SHOP_ACCOUNT.slice(-4)}-өөр төгссөн дансны гүйлгээ`);
  const run = () => checkYahoo().catch(err => console.error('Yahoo poll алдаа:', err.message));
  run();
  setInterval(run, POLL_MS);
}

async function checkYahoo() {
  if (lastUid == null) lastUid = Number(await getSetting(STATE_KEY)) || 0;

  const client = new ImapFlow({
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
    auth: { user: USER, pass: PASS },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(FOLDER, { readOnly: true });
    try {
      // Анх удаа: сүүлийн 3 хоногийнхоос эхэлнэ. Дараа нь зөвхөн шинэ UID.
      const query = lastUid
        ? { from: FROM, uid: `${lastUid + 1}:*` }
        : { from: FROM, since: new Date(Date.now() - 3 * 86400000) };
      const uids = ((await client.search(query, { uid: true })) || [])
        .filter(u => u > lastUid)
        .sort((a, b) => a - b);
      if (!uids.length) return;

      let skipped = 0;
      let done = lastUid;   // алдаа гарвал тэр и-мэйлээс дахин эхэлнэ (гүйлгээ алдагдахгүй)
      for (const uid of uids) {
        let parsed, text;
        try {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          parsed = await simpleParser(msg.source);
          text = await extractText(parsed);
        } catch (err) {
          // Уншигдахгүй и-мэйл — алгасна, эс бол дараагийнх нь үүрд гацна
          console.error('Yahoo и-мэйл унших алдаа (алгаслаа):', err.message);
          done = uid;
          continue;
        }
        if (!mentionsAccount(text, SHOP_ACCOUNT)) { skipped++; done = uid; continue; }
        try {
          await recordTransaction({ ...buildTx(parsed, text), bank: 'Хаан банк' });
          done = uid;
        } catch (err) {
          // Sheets/Discord түр алдаа — дараагийн шалгалтаар энэ и-мэйлээс дахин оролдоно
          console.error('Yahoo гүйлгээ бүртгэх алдаа:', err.message);
          break;
        }
      }
      if (skipped) console.log(`Yahoo: дэлгүүрийн биш ${skipped} гүйлгээг алгаслаа`);

      if (done !== lastUid) {
        lastUid = done;
        await setSetting(STATE_KEY, lastUid);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
