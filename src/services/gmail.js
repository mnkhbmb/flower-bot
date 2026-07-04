// Gmail-аас "bank-transaction" label-тай и-мэйлүүдийг IMAP-аар уншиж,
// задлаад Discord руу зардлын мэдэгдэл явуулна.
// Урьдчилсан нөхцөл: Gmail дээр IMAP асаах + App Password (2FA шаардана).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PDFParse } from 'pdf-parse';
import { parseTransactionBody, hasAmount, stripHtml, extractBalance } from './bankParser.js';
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

// PDF хавсралтаас текст гаргах (ХасБанк)
async function extractPdfText(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const res = await parser.getText();
    return res.text || '';
  } catch (err) {
    console.error('PDF унших алдаа:', err.message);
    return '';
  }
}

// Имэйлээс боловсруулах текст сонгох: plain → html → PDF (заавраар)
async function extractText(parsed) {
  // 1. text/plain дотор дүн байвал шууд
  if (parsed.text && hasAmount(parsed.text)) return parsed.text;
  // 2. text/html → цэвэрлээд дүн байвал (Голомт, ХХБ EBANK)
  const stripped = stripHtml(parsed.html || '');
  if (stripped && hasAmount(stripped)) return stripped;
  // 3. PDF хавсралт (ХасБанк — мэдээлэл зөвхөн тэнд)
  const pdfs = (parsed.attachments || []).filter(a =>
    a.contentType === 'application/pdf' || /\.pdf$/i.test(a.filename || ''));
  for (const a of pdfs) {
    const txt = await extractPdfText(a.content);
    if (txt) return txt;
  }
  // 4. Fallback — ямар нэг текст
  return parsed.text || stripped || '';
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
          const text = await extractText(parsed);
          const base = parseTransactionBody(text);
          const tx = {
            ...base,
            date: parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : '',
            balance: extractBalance(text),
            parsed: base.amount != null,
            subject: (parsed.subject || '').trim(),
          };
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
    if (/mailbox|not.*exist|NONEXISTENT/i.test(err.message)) {
      console.error(`❌ Gmail-д "${LABEL}" label олдсонгүй. Label нэрээ шалга (GMAIL_BANK_LABEL).`);
    } else {
      throw err;
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
