// Gmail-аас "bank-transaction" label-тай и-мэйлүүдийг IMAP-аар уншиж,
// задлаад Discord руу зардлын мэдэгдэл явуулна.
// Урьдчилсан нөхцөл: Gmail дээр IMAP асаах + App Password (2FA шаардана).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseBankEmail } from './bankParser.js';
import { notifyTransaction } from './discord.js';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const LABEL = process.env.GMAIL_BANK_LABEL || 'bank-transaction';
const POLL_MS = 2 * 60 * 1000; // 2 минут тутам

// Сервер асахад дуудна
export function startGmailPoller() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log('ℹ️ Gmail poller идэвхгүй (GMAIL_USER / GMAIL_APP_PASSWORD тохируулаагүй)');
    return;
  }
  console.log(`📧 Gmail poller эхэллээ — "${LABEL}" label шалгана`);
  checkInbox().catch(err => console.error('Gmail анхны шалгалт алдаа:', err.message));
  setInterval(() => {
    checkInbox().catch(err => console.error('Gmail poll алдаа:', err.message));
  }, POLL_MS);
}

async function checkInbox() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  await client.connect();
  try {
    // Gmail-ийн label нь IMAP mailbox хэлбэрээр харагдана
    const lock = await client.getMailboxLock(LABEL);
    try {
      // Зөвхөн уншаагүй (UNSEEN) и-мэйлүүд
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return;

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          const parsed = await simpleParser(msg.source);
          const tx = parseBankEmail({
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            text: parsed.text || parsed.html || '',
            date: parsed.date || new Date(),
          });
          await notifyTransaction(tx);
        } catch (err) {
          console.error('Gmail нэг и-мэйл боловсруулах алдаа:', err.message);
        }
        // Давхар боловсруулахгүйн тулд уншсан гэж тэмдэглэнэ
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }).catch(() => {});
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    // Label олдохгүй бол ойлгомжтой мэдэгдэл
    if (/mailbox|not.*exist|NONEXISTENT/i.test(err.message)) {
      console.error(`❌ Gmail-д "${LABEL}" label олдсонгүй. Label нэрээ шалга (GMAIL_BANK_LABEL).`);
    } else {
      throw err;
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
