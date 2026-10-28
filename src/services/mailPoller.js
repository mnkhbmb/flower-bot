// Банкны мэдэгдлийн шуудангийн хайрцгийг IMAP-аар уншдаг ерөнхий хэсэг (Gmail, Yahoo).
// "Уншсан/уншаагүй" тэмдэгт найдахгүй: хүн и-мэйлийг нээсэн ч алгасахгүйн тулд хаана
// хүртэл уншсанаа (UID) "Тохиргоо" tab-д хадгална. Шууданг зөвхөн уншина (readOnly).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseTransactionBody, hasAmount, stripHtml, extractBalance, isOwnTransfer } from './bankParser.js';
import { recordTransaction } from './bankTx.js';
import { getSetting, setSetting } from './sheets.js';

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

// Имэйлээс боловсруулах текст сонгох: plain → html → PDF
export async function extractText(parsed) {
  // 1. text/plain дотор дүн байвал шууд
  if (parsed.text && hasAmount(parsed.text)) return parsed.text;
  // 2. text/html → цэвэрлээд дүн байвал (Голомт, ХХБ EBANK, ХасБанк мэдэгдэл)
  const stripped = stripHtml(parsed.html || '');
  if (stripped && hasAmount(stripped)) return stripped;
  // 3. PDF хавсралт (ХасБанкны баримт — мэдээлэл зөвхөн тэнд)
  const pdfs = (parsed.attachments || []).filter(a =>
    a.contentType === 'application/pdf' || /\.pdf$/i.test(a.filename || ''));
  for (const a of pdfs) {
    const txt = await extractPdfText(a.content);
    if (txt) return txt;
  }
  // 4. Fallback — ямар нэг текст
  return parsed.text || stripped || '';
}

// Задалсан и-мэйл + текстээс гүйлгээний объект
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

// opts: { name, host, user, pass, folder, stateKey, search?, accept?(text), overrides?(text) }
//   search — IMAP-ийн нэмэлт шүүлт (жнь { from: 'khanbank' })
//   accept — текстийг шалгаад false бол бүртгэхгүй (жнь хувийн данс)
export function startMailPoller(opts) {
  const state = { lastUid: null, running: false, diagnosed: false };
  const run = async () => {
    if (state.running) return;          // өмнөх шалгалт дуусаагүй бол давхар эхлүүлэхгүй
    state.running = true;
    try {
      await checkMailbox(opts, state);
    } catch (err) {
      console.error(`${opts.name} шалгах алдаа:`, err.message);
    } finally {
      state.running = false;
    }
  };
  run();
  setInterval(run, 2 * 60 * 1000);      // 2 минут тутам
}

async function checkMailbox(opts, state) {
  if (state.lastUid == null) state.lastUid = Number(await getSetting(opts.stateKey)) || 0;
  const lastUid = state.lastUid;

  const client = new ImapFlow({
    host: opts.host, port: 993, secure: true,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
  });
  await client.connect();
  try {
    let lock;
    try {
      lock = await client.getMailboxLock(opts.folder, { readOnly: true });
    } catch (err) {
      if (!/mailbox|not.*exist|NONEXISTENT/i.test(err.message)) throw err;
      // Байгаа хавтас/label-уудыг жагсааж өгнө — аль нь зөв болохыг шууд харахад
      const boxes = await client.list().catch(() => []);
      const names = boxes.map(b => b.path).filter(p => !p.startsWith('[Gmail]'));
      console.error(`❌ ${opts.name}: "${opts.folder}" олдсонгүй. Эдгээрийн аль нэгийг бичнэ үү: ${names.join(', ') || '(алга)'}`);
      return;
    }

    try {
      // Анх удаа: сүүлийн 3 хоногийнхоос эхэлнэ (давхардлыг sheet-ийн түлхүүрээр шүүнэ).
      // Дараа нь зөвхөн шинэ UID.
      const query = lastUid
        ? { ...opts.search, uid: `${lastUid + 1}:*` }
        : { ...opts.search, since: new Date(Date.now() - 3 * 86400000) };
      const uids = ((await client.search(query, { uid: true })) || [])
        .filter(u => u > lastUid)
        .sort((a, b) => a - b);
      // Асахдаа нэг удаа: хавтаст хэдэн и-мэйл байгаа, шүүлтэд хэд нь тохирсныг хэлнэ
      // (Хаан банкны и-мэйл огт ирэхгүй байгааг олоход). Илгээгч, агуулгыг логлохгүй.
      if (!state.diagnosed) {
        state.diagnosed = true;
        const since = new Date(Date.now() - 3 * 86400000);
        const all = ((await client.search({ since }, { uid: true })) || []).length;
        const matched = opts.search ? ((await client.search({ ...opts.search, since }, { uid: true })) || []).length : all;
        console.log(`🔍 ${opts.name}: "${opts.folder}" хавтаст сүүлийн 3 хоногт ${all} и-мэйл` +
          (opts.search ? `, үүнээс ${JSON.stringify(opts.search)} шүүлтэд тохирсон ${matched}` : ''));
      }
      if (!uids.length) return;
      console.log(`📧 ${opts.name}: ${uids.length} шинэ и-мэйл`);

      let skipped = 0;
      let done = lastUid;   // бүртгэх үед алдаа гарвал тэр и-мэйлээс дахин эхэлнэ
      for (const uid of uids) {
        let parsed, text;
        try {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          parsed = await simpleParser(msg.source);
          text = await extractText(parsed);
        } catch (err) {
          // Уншигдахгүй и-мэйл — алгасна, эс бол дараагийнх нь үүрд гацна
          console.error(`${opts.name} и-мэйл унших алдаа (алгаслаа):`, err.message);
          done = uid;
          continue;
        }
        if (opts.accept && !opts.accept(text)) {
          // Гарчгийг л харуулна — дансны дугаарын бичлэг өөр байвал олоход тусална
          console.log(`${opts.name}: дансны дугаар таарсангүй — "${(parsed.subject || '').slice(0, 60)}"`);
          skipped++; done = uid; continue;
        }
        try {
          const extra = typeof opts.overrides === 'function' ? opts.overrides(text) : opts.overrides;
          await recordTransaction({ ...buildTx(parsed, text), ...extra });
          done = uid;
        } catch (err) {
          // Sheets/Discord түр алдаа — дараагийн шалгалтаар дахин оролдоно
          console.error(`${opts.name} гүйлгээ бүртгэх алдаа:`, err.message);
          break;
        }
      }
      if (skipped) console.log(`${opts.name}: ${skipped} и-мэйлийг алгаслаа (шүүлтэд тохироогүй)`);

      if (done !== lastUid) {
        state.lastUid = done;
        await setSetting(opts.stateKey, done);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
