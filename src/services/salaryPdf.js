// Цалингийн тооцооны PDF — #цалин руу Discord embed-тэй хамт явуулна.
// pdfkit-ийн стандарт фонт кирилл үсэггүй тул DejaVu Sans (Ө, Ү, ₮ бүгд бий) ашиглана.
import PDFDocument from 'pdfkit';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const mn = n => `${Math.round(n || 0).toLocaleString('en-US')}₮`;

// { from, to, workers: getSalaryReport().workers, advances, directors: [{name, amount}], finance? } → Buffer
export function buildSalaryPdf({ from, to, workers, advances, directors, finance }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Цалин ${from} ~ ${to}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('r', FONT);
    doc.registerFont('b', FONT_BOLD);

    const left = doc.page.margins.left;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    // Хүснэгтийн нэг мөр: эхний багана зүүн, бусад нь баруун тийш тэгшилнэ
    const row = (cells, widths, { bold = false, fill = null, align = null } = {}) => {
      if (doc.y > bottom()) doc.addPage();
      const y = doc.y;
      const width = widths.reduce((s, w) => s + w, 0);
      if (fill) doc.rect(left, y - 3, width, 17).fill(fill);
      doc.fillColor('black').font(bold ? 'b' : 'r').fontSize(9);
      let x = left;
      cells.forEach((c, i) => {
        doc.text(String(c ?? ''), x + 3, y, {
          width: widths[i] - 6, lineBreak: false, ellipsis: true,
          align: align?.[i] || (i === 0 ? 'left' : 'right'),
        });
        x += widths[i];
      });
      doc.x = left;
      doc.y = y + 17;
    };
    const heading = text => {
      if (doc.y > bottom() - 40) doc.addPage();
      doc.moveDown(0.8).font('b').fontSize(12).fillColor('black').text(text, left);
      doc.moveDown(0.3);
    };

    doc.font('b').fontSize(16).text('La Paradiso — Цалингийн тооцоо');
    doc.font('r').fontSize(10).fillColor('#555')
      .text(`Хугацаа: ${from} ~ ${to}  ·  Гаргасан: ${new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')}`);

    // ----- Нэгтгэл -----
    heading('Нэгтгэл');
    const W = [125, 45, 70, 45, 80, 70, 80];
    row(['Нэр', 'Өдөр', 'Өдрийн', 'Цаг', 'Цалин', 'Зээл', 'Олгох'], W, { bold: true, fill: '#eeeeee' });
    let total = 0;
    for (const [name, w] of Object.entries(workers)) {
      const adv = advances[name] || 0;
      total += w.salary - adv;
      row([name, w.days, mn(w.rate), w.hours, mn(w.salary), adv ? `-${mn(adv)}` : '', mn(w.salary - adv)], W);
    }
    for (const d of directors) {
      const adv = advances[d.name] || 0;
      total += d.amount - adv;
      row([`${d.name} (захирал)`, '', 'тогтмол', '', mn(d.amount), adv ? `-${mn(adv)}` : '', mn(d.amount - adv)], W);
    }
    row(['Нийт олгох', '', '', '', '', '', mn(total)], W, { bold: true, fill: '#fff3cd' });

    // ----- Хугацааны орлого -----
    if (finance?.count) {
      heading('Хугацааны орлого (Өдрийн хаалт)');
      const F = [200, 120];
      row(['Нийт борлуулалт', mn(finance.niit)], F, { bold: true });
      row(['Бэлэн', mn(finance.belen)], F);
      row(['Данс', mn(finance.dans)], F);
      row(['Пос', mn(finance.pos)], F);
      row(['Зарлага', `-${mn(finance.zarlaga)}`], F);
      row(['Цэвэр орлого', mn(finance.tsever)], F, { bold: true });
      row([`${finance.days} өдөр, ${finance.count} хаалт`, ''], F);
    }

    // ----- Ажилтан бүрийн ирц -----
    const D = [110, 80, 80, 245];
    for (const [name, w] of Object.entries(workers)) {
      heading(`${name} — ирц (${w.days} өдөр, ${w.hours} цаг)`);
      row(['Огноо', 'Ирсэн', 'Гарсан', 'Тэмдэглэл'], D, { bold: true, fill: '#eeeeee', align: ['left', 'left', 'left', 'left'] });
      for (const day of w.detail) {
        const note = [!day.complete && 'нэг цаг дутуу', day.duplicated && 'давхар бүртгэл'].filter(Boolean).join(', ');
        row([day.date, day.in || '—', day.out || '—', note], D, { align: ['left', 'left', 'left', 'left'] });
      }
    }

    doc.end();
  });
}
