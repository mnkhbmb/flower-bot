// Gmail-аас "bank-transaction" label-тай и-мэйлүүдийг IMAP-аар уншиж,
// задлаад "Гүйлгээ" tab-д хадгалж, Discord руу мэдэгдэл явуулна (bankTx.js).
// Урьдчилсан нөхцөл: Gmail дээр IMAP асаах + App Password (2FA шаардана).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseTransactionBody, hasAmount, stripHtml, extractBalance, isOwnTransfer } from './bankParser.js';
import { recordTransaction } from './bankTx.js';

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

// PDF хавсралтаас текст гаргах (ХасБанк).
// pdf-parse-ийг зөвхөн хэрэгтэй үед lazy-load хийнэ (import үед сервер унахаас сэргийлж,
// lib замаар шууд орж index.js-ийн debug кодыг алгасна).
async function extractPdfText(buffer) {
  try {
    const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdf(buffer);
    return data.text || '';
  } catch (err) {
    console.error('PDF унших алдаа:', err.message);
    return '';
  }
}

// Имэйлээс боловсруулах текст сонгох: plain → html → PDF (заавраар)
export async function extractText(parsed) {
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

// Задалсан и-мэйл + текстээс гүйлгээний объект (Gmail, Yahoo хоёулаа ашиглана)
export function buildTx(parsed, text) {
  const base = parseTransactionBody(text);
  // Улаанбаатарын цагаар огноо, цаг
  const ub = new Date((parsed.date ? new Date(parsed.date) : new Date()).getTime() + 8 * 3600 * 1000).toISOString();
  return {
    ...base,
    date: ub.slice(0, 10),
    time: ub.slice(11, 16),
    balance: extractBalance(text),
    ownTransfer: isOwnTransfer(text),
    parsed: base.amount != null,
    subject: (parsed.subject || '').trim(),
    // Нэг и-мэйлийг хоёр удаа бүртгэхгүйн тулд
    key: parsed.messageId || [ub, base.amount, base.description].join('|'),
  };
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
          await recordTransaction(buildTx(parsed, await extractText(parsed)));
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
      // Байгаа label-уудыг жагсааж өгнө — аль нь зөв болохыг шууд харахад
      const boxes = await client.list().catch(() => []);
      const names = boxes.map(b => b.path).filter(p => !p.startsWith('[Gmail]') && p !== 'INBOX');
      console.error(`❌ Gmail-д "${LABEL}" label олдсонгүй. GMAIL_BANK_LABEL-ийг эдгээрийн аль нэгээр солино уу: ${names.join(', ') || '(label алга)'}`);
    } else {
      throw err;
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
