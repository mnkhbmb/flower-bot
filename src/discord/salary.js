import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { client, WORKERS, DIRECTORS } from './client.js';
import { logAttendance, getSalaryReport, saveSalaryToSheet, getAdvances, getPeriodReport, getTopSold, getSalaryRates, setSalaryRate, rateFor, getWorkerNames, DEFAULT_DAILY_RATE, getTransactionTotals, listTransactions, getAccountBalances } from '../services/sheets.js';
import { buildSalaryPdf } from '../services/salaryPdf.js';
import { ubToday, addDays, salaryPeriodFor } from '../utils/periods.js';
import { bankEmbed, accountName } from './bank.js';
import { financeEmbed, topSoldEmbed } from './shop.js';

// Хугацааны цэвэр цалин (зээл хассан) — нэр → дүн. buildSalaryEmbed-тэй ижил тооцоо.
async function netSalaries(from, to) {
  const report = await getSalaryReport(from, to, DIRECTORS.map(d => d.name));
  const advances = await getAdvances(from, to);
  const out = {};
  for (const [name, data] of Object.entries(report.workers)) out[name] = data.salary - (advances[name] || 0);
  for (const d of DIRECTORS) out[d.name] = d.amount - (advances[d.name] || 0);
  return out;
}

// Бодсон цалин ба банкаар шилжүүлсэн цалин ("Цалин" ангилал, хугацааны сүүлийн өдрөөс 5 хоног) — нэрээр
export async function salaryPayments(from, to) {
  const owed = await netSalaries(from, to);
  const pays = (await listTransactions(addDays(to, -1), addDays(to, 5)))
    .filter(tx => tx.txType === 'Зарлага' && tx.category === 'Цалин');
  const paid = {};
  let unknown = 0;
  for (const tx of pays) {
    if (!tx.person) { unknown += tx.amount; continue; }
    const key = Object.keys(owed).find(n => n.toLowerCase() === tx.person.toLowerCase()) || tx.person;
    paid[key] = (paid[key] || 0) + tx.amount;
  }
  return { owed, paid, unknown };
}

// Өнөөдрийг агуулсан цалингийн хугацаа (Улаанбаатарын цагаар)
function getSalaryPeriod() {
  return salaryPeriodFor(ubToday());
}

// Цалингийн тооцоог уншаад embed бэлдэх (sheet-с динамикаар).
// save=true үед Цалин sheet-д хадгална (cron-д).
async function buildSalaryEmbed(from, to, { save = false } = {}) {
  // Захирлуудын нэрийг хасаж, бусад бүх ажилтныг динамикаар тоолно
  const report = await getSalaryReport(from, to, DIRECTORS.map(d => d.name));
  // Тухайн хугацаанд авсан зээл/урьдчилгаа (нэрээр)
  const advances = await getAdvances(from, to);

  // Дүнг зээлээр хасаж мөрийн текст бэлдэх туслах
  const line = (gross, adv) => {
    const net = gross - adv;
    return adv > 0
      ? `💰 ${gross.toLocaleString()}₮ · 💸 Зээл: -${adv.toLocaleString()}₮ · ✅ **${net.toLocaleString()}₮**`
      : `💰 **${gross.toLocaleString()}₮**`;
  };

  // Ажилтны цалин (өдрөөр, зээл хассан)
  const netWorkers = {};
  const workerFields = Object.entries(report.workers).map(([name, data]) => {
    const adv = advances[name] || 0;
    netWorkers[name] = { ...data, salary: data.salary - adv };
    return {
      name: `👩 ${name}`,
      value: `📅 ${data.days} өдөр × ${data.rate.toLocaleString()}₮ · ⏱ ${data.hours} цаг\n${line(data.salary, adv)}`,
      inline: false,
    };
  });

  // Захирлын тогтмол цалин (зээл хассан)
  const netDirectors = DIRECTORS.map(d => ({ ...d, amount: d.amount - (advances[d.name] || 0) }));
  const directorFields = DIRECTORS.map(d => {
    const adv = advances[d.name] || 0;
    return {
      name: `👑 ${d.name}`,
      value: adv > 0 ? line(d.amount, adv) : `💰 **${d.amount.toLocaleString()}₮** (тогтмол)`,
      inline: false,
    };
  });

  const workerTotal = Object.values(netWorkers).reduce((s, w) => s + w.salary, 0);
  const directorTotal = netDirectors.reduce((s, d) => s + d.amount, 0);
  const grandTotal = workerTotal + directorTotal;

  if (save) {
    await saveSalaryToSheet(from, to, netWorkers, netDirectors);
  }

  const embed = new EmbedBuilder()
    .setColor(0xF4B400)
    .setTitle(`💵 Цалингийн тооцоо — ${from} ~ ${to}`)
    .addFields(
      workerFields.length
        ? workerFields
        : [{ name: '👩 Ажилтан', value: 'Энэ хугацаанд ирцийн бүртгэл алга', inline: false }]
    )
    .addFields({ name: '─────────────', value: '👑 **Захирлууд**', inline: false })
    .addFields(...directorFields)
    .addFields({ name: '─────────────', value: `**Нийт: ${grandTotal.toLocaleString()}₮**`, inline: false })
    .setTimestamp();

  // Тухайн хугацааны орлого/зарлага (Өдрийн хаалт tab-аас)
  let financeEmbeds = [];
  let period = null;
  try {
    period = await getPeriodReport(from, to);
    financeEmbeds = [financeEmbed(period)];
  } catch (err) {
    console.error('Хугацааны орлого унших алдаа:', err.message);
  }
  // Банкны бодит гүйлгээ (Gmail-ээс автоматаар) — бүртгэл байвал л
  let bank = null;
  try {
    bank = await getTransactionTotals(from, to);
    if (bank.count) financeEmbeds.push(bankEmbed(bank));
  } catch (err) {
    console.error('Банкны гүйлгээ унших алдаа:', err.message);
  }

  // Тухайн хугацаанд хамгийн их зарагдсан цэцэг (Хаалт задаргаа tab-аас)
  let topEmbeds = [];
  let top = null;
  try {
    top = await getTopSold(from, to);
    if (top.flowers.length) {
      topEmbeds = [topSoldEmbed(top, `🏆 Хамгийн их зарагдсан цэцэг — ${from} ~ ${to}`, 10)];
    }
  } catch (err) {
    console.error('Борлуулалтын эрэмбэ унших алдаа:', err.message);
  }

  const embeds = [embed, attendanceEmbed(report), ...financeEmbeds, ...topEmbeds];
  const files = [];
  try {
    const balances = (await getAccountBalances().catch(() => [])).map(b => ({ ...b, name: accountName(b.account) }));
    const pdf = await buildSalaryPdf({ from, to, workers: report.workers, advances, directors: DIRECTORS, finance: period, bank, top, balances });
    files.push(new AttachmentBuilder(pdf, { name: `tsalin_${from}_${to}.pdf` }));
  } catch (err) {
    console.error('Цалингийн PDF алдаа:', err.message);
  }
  return { embeds, files };
}

// Ирцийн задаргаа — өдөр бүрийн ирсэн/гарсан цаг (цалинтай хамт явна)
function attendanceEmbed(report) {
  const fields = Object.entries(report.workers).map(([name, data]) => {
    const lines = data.detail.map(dd => {
      const day = dd.date.slice(5);                       // "2026-08-05" → "08-05"
      const inT = dd.in || '⚠️ —';
      const outT = dd.out || '⚠️ —';
      return `\`${day}\` ${inT} → ${outT}${dd.duplicated ? '  🔁' : ''}`;
    });
    let value = lines.join('\n') || 'Бүртгэл алга';
    if (value.length > 1000) value = value.slice(0, 1000) + '\n…';
    return { name: `👩 ${name} — ${data.days} өдөр`, value, inline: false };
  });

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Ирцийн задаргаа')
    .addFields(fields.length ? fields : [{ name: 'Ирц', value: 'Бүртгэл алга', inline: false }])
    .setFooter({ text: '⚠️ = цаг бүртгэгдээгүй · 🔁 = тухайн өдөр давхар бүртгэгдсэн' })
    .setTimestamp();
}

// Цалингийн тооцоо — сарын 10, 25-нд 14:00-д (cron). Sheet-д хадгалж, PDF хавсаргана.
export async function sendSalaryReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_SALARY_CHANNEL_ID);
  const { from, to } = getSalaryPeriod();
  const { embeds, files } = await buildSalaryEmbed(from, to, { save: true });
  await channel.send({ embeds, files });
}

// "Цалингаа шилжүүлээрэй" сануулга — 10, 25-нд 17:00, 20:00-д (cron).
// Банкаар шилжүүлсэн нь харагдсан хүнийг хасна; бүгд авсан бол юу ч явуулахгүй.
export async function sendSalaryPayReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_SALARY_CHANNEL_ID);
  const { from, to } = getSalaryPeriod();
  const { owed, paid, unknown } = await salaryPayments(from, to);
  const left = Object.entries(owed)
    .map(([name, amount]) => [name, Math.round(amount - (paid[name] || 0))])
    .filter(([, rest]) => rest >= 100);
  if (!left.length) return;
  const total = left.reduce((s, [, rest]) => s + rest, 0);
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('⏰ Цалингаа шилжүүлээрэй')
      .setDescription(
        `${from} ~ ${to}\n\n${left.map(([name, rest]) => `**${name}** — ${rest.toLocaleString()}₮`).join('\n')}` +
        `\n\nНийт: **${total.toLocaleString()}₮**` +
        (unknown > 0 ? `\n❓ Хэнийх нь тодорхойгүй шилжүүлэг: ${unknown.toLocaleString()}₮ — #орлого-зарлага-бүртгэл дээр сонгоно уу` : '') +
        '\n\n_Банкаар шилжүүлсэн нь харагдсан хүнийг жагсаалтаас хасна. Бэлнээр өгсөн бол тоохгүй байж болно._')
      .setTimestamp()],
  });
}

export async function handleSalaryInteraction(interaction) {
  // /tsalin-unelgee — ажилтны нэрийг Ирц-ээс санал болгоно
  if (interaction.isAutocomplete()) {
    try {
      const typed = String(interaction.options.getFocused() || '').toLowerCase();
      const names = [...new Set([...WORKERS, ...(await getWorkerNames())])]
        .filter(n => !DIRECTORS.some(d => d.name === n))
        .filter(n => n.toLowerCase().includes(typed))
        .slice(0, 25);
      await interaction.respond(names.map(n => ({ name: n, value: n })));
    } catch {
      await interaction.respond([]).catch(() => {});
    }
    return true;
  }

  if (!interaction.isChatInputCommand()) return false;

  // /tsalin — энэ хугацааны цалин харах (sheet-д хадгалахгүй, зөвхөн харна)
  if (interaction.commandName === 'tsalin') {
    await interaction.deferReply();
    try {
      const { from, to } = getSalaryPeriod();
      const { embeds, files } = await buildSalaryEmbed(from, to, { save: false });
      await interaction.editReply({ embeds, files });
    } catch (err) {
      console.error('tsalin error:', err.message);
      await interaction.editReply('⚠️ Цалин тооцоход алдаа гарлаа.');
    }
    return true;
  }

  // /tsalin-unelgee — өдрийн цалин харах / тохируулах
  if (interaction.commandName === 'tsalin-unelgee') {
    await interaction.deferReply();
    try {
      const name = (interaction.options.getString('ner') || '').trim();
      const amount = interaction.options.getInteger('dun');

      if (name && amount != null) {
        await setSalaryRate(name, amount);
        const known = await getWorkerNames();
        const warn = known.some(n => n.toLowerCase() === name.toLowerCase())
          ? ''
          : `\n⚠️ Ирц дээр **${name}** нэртэй бүртгэл алга. Ирц дээрх нэртэй яг ижил бичнэ үү.`;
        await interaction.editReply(amount > 0
          ? `✅ **${name}** — өдрийн цалин **${amount.toLocaleString()}₮** боллоо.${warn}`
          : `↩️ **${name}** — үндсэн дүнд буцлаа (${DEFAULT_DAILY_RATE.toLocaleString()}₮/өдөр).`);
        return true;
      }

      // Жагсаалт харуулах (нэг хүн эсвэл бүгд)
      const rates = await getSalaryRates();
      const names = [...new Set([...WORKERS, ...(await getWorkerNames()), ...Object.keys(rates)])]
        .filter(n => !DIRECTORS.some(d => d.name === n))
        .filter(n => !name || n.toLowerCase() === name.toLowerCase());
      if (name && !names.length) names.push(name);
      const lines = names.map(n => {
        const custom = Object.keys(rates).some(k => k.toLowerCase() === n.toLowerCase());
        return `• **${n}** — ${rateFor(rates, n).toLocaleString()}₮${custom ? '' : ' _(үндсэн)_'}`;
      });
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xF4B400)
          .setTitle('💵 Өдрийн цалингийн үнэлгээ')
          .setDescription((lines.join('\n') || 'Ажилтан алга') +
            `\n\nҮндсэн дүн: **${DEFAULT_DAILY_RATE.toLocaleString()}₮**\nӨөрчлөх: \`/tsalin-unelgee ner:Амина dun:75000\``)],
      });
    } catch (err) {
      console.error('tsalin-unelgee error:', err.message);
      await interaction.editReply('⚠️ Цалингийн үнэлгээ хадгалахад алдаа гарлаа.');
    }
    return true;
  }

  // /irts
  if (interaction.commandName === 'irts') {
    const name = interaction.user.displayName || interaction.user.username;
    const type = interaction.options.getString('torol');
    const emoji = type === 'in' ? '🟢' : '🔴';
    const label = type === 'in' ? 'ирлээ' : 'гарлаа';

    // Шууд хариу өгнө (3 секундын дотор)
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(type === 'in' ? 0x34A853 : 0xC9445A)
          .setTitle(`${emoji} Ирц бүртгэгдлээ`)
          .setDescription(`**${name}** ${label}`)
          .setTimestamp()
      ]
    });

    // Sheets-д бичих (дараа нь)
    try {
      const result = await logAttendance(name, type);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(type === 'in' ? 0x34A853 : 0xC9445A)
            .setTitle(`${emoji} Ирц бүртгэгдлээ`)
            .setDescription(`**${name}** ${result.time}-д ${label}`)
            .setTimestamp()
        ]
      });
    } catch (err) {
      console.error('Irts sheets error:', err);
    }
    return true;
  }
  return false;
}
