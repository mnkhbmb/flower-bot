// Gmail-аас банкны label-тай и-мэйлүүдийг IMAP-аар уншиж, "Гүйлгээ" tab-д хадгалж,
// Discord руу мэдэгдэл явуулна (уншилт: mailPoller.js, бүртгэл: bankTx.js).
// Урьдчилсан нөхцөл: Gmail App Password (2FA шаардана).
import { startMailPoller } from './mailPoller.js';

export function startGmailPoller() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const label = process.env.GMAIL_BANK_LABEL || 'bank-transaction';
  if (!user || !pass) {
    console.log('ℹ️ Gmail poller идэвхгүй (GMAIL_USER / GMAIL_APP_PASSWORD тохируулаагүй)');
    return;
  }
  console.log(`📧 Gmail poller эхэллээ — "${label}" label шалгана`);
  // Gmail-ийн label нь IMAP-д хавтас хэлбэрээр харагдана
  startMailPoller({
    name: 'Gmail', host: 'imap.gmail.com', user, pass,
    folder: label, stateKey: 'gmail_last_uid',
  });
}
