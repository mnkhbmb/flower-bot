import { EmbedBuilder } from 'discord.js';
import { client } from './client.js';
import { getPeriodReport, getTransactionTotals, getAccountBalances } from '../services/sheets.js';
import { shopAccounts } from '../services/bankParser.js';
import { addDays, lastEndedPeriod, currentPeriodSoFar } from '../utils/periods.js';
import { POS_BANK, DANS_BANK, posFeePct, balanceLine } from './bank.js';
import { salaryPayments } from './salary.js';

async function buildReconcileEmbed(from, to) {
  const [period, t] = await Promise.all([getPeriodReport(from, to), getTransactionTotals(from, to)]);
  const mn = n => `${Math.round(n).toLocaleString()}₮`;
  const fee = posFeePct();
  const mark = diff => (Math.abs(diff) < 100 ? '✅' : `⚠️ ${diff > 0 ? '+' : ''}${mn(diff)}`);
  const verdict = diff => (Math.abs(diff) < 100 ? '✅ Таарч байна' : `⚠️ Зөрүү: **${diff > 0 ? '+' : ''}${mn(diff)}**`);

  // Yahoo-д "Данс", "Бэлэн" гэж нэрлэсэн Хаан данс байвал тэдгээрээр, эс бол банкаар нь
  const labels = shopAccounts().map(a => a.label);
  const DANS_KEY = labels.find(l => /данс/i.test(l)) || DANS_BANK;
  const CASH_KEY = labels.find(l => /бэлэн/i.test(l)) || null;
  // Хаан банк орлогын мэдэгдэл явуулдаггүй — орлого огт бүртгэгдээгүй бол тулгахгүй
  // (эс бол бүх Данс "дутуу" мэт харагдана)
  const dansTracked = (t.byAccount[DANS_KEY]?.in || 0) > 0;
  const cashTracked = CASH_KEY && (t.byAccount[CASH_KEY]?.in || 0) > 0;

  const posFee = Math.round(period.pos * fee / 100);
  const posExpected = period.pos - posFee;
  const xac = t.salesByBank[POS_BANK] || 0;
  const khan = t.salesByBank[DANS_KEY] || 0;
  const posDiff = Math.round(xac - posExpected);
  const dansDiff = Math.round(khan - period.dans);

  // Өдөр бүрээр: хаалтын өдөр болон банкны өдрийг нэгтгэнэ
  const days = [...new Set([...Object.keys(period.byDay || {}), ...Object.keys(t.salesByDay)])].sort();
  const lines = days.map(day => {
    const h = (period.byDay || {})[day] || { dans: 0, pos: 0 };
    const b = t.salesByDay[day] || {};
    const p = Math.round((b[POS_BANK] || 0) - h.pos * (1 - fee / 100));
    const dn = Math.round((b[DANS_KEY] || 0) - h.dans);
    return `\`${day.slice(5)}\` Пос ${mark(p)}${dansTracked ? ` · Данс ${mark(dn)}` : ''}`;
  });
  let daily = lines.join('\n') || 'Энэ хугацаанд бүртгэл алга.';
  if (daily.length > 3000) daily = daily.slice(0, 3000) + '\n…';

  // ----- Цалингийн олголт: бодсон цалин ↔ банкаар шилжүүлсэн (Цалин ангилал) -----
  // Цалинг хугацааны сүүлийн өдөр эсвэл дараа нь өгдөг тул тэр орчмын гүйлгээг харна.
  let salaryText = '';
  let salaryOk = true;
  try {
    const { owed, paid, unknown } = await salaryPayments(from, to);
    const names = [...new Set([...Object.keys(owed), ...Object.keys(paid)])];
    const rows = names.map(n => {
      const diff = Math.round((paid[n] || 0) - (owed[n] || 0));
      if (Math.abs(diff) >= 100) salaryOk = false;
      return `**${n}**: бодсон ${mn(owed[n] || 0)} · шилжүүлсэн ${mn(paid[n] || 0)} ${mark(diff)}`;
    });
    if (unknown > 0) {
      salaryOk = false;
      rows.push(`❓ Хэнийх нь тодорхойгүй цалин: **${mn(unknown)}** — #орлого-зарлага-бүртгэл дээр сонгоно уу`);
    }
    salaryText = rows.join('\n');
  } catch (err) {
    console.error('Цалингийн тулгалт алдаа:', err.message);
  }

  const allOk = Math.abs(posDiff) < 100 && (!dansTracked || Math.abs(dansDiff) < 100) && salaryOk;
  const embed = new EmbedBuilder()
    .setColor(allOk ? 0x2ECC71 : 0xE67E22)
    .setTitle(`🔎 Тулгалт — ${from} ~ ${to}`)
    .setDescription(`**Пос${dansTracked ? ', Данс' : ''} өдрөөр**\n${daily}`)
    .addFields({
      name: `💳 Пос → ${POS_BANK}`,
      value: `Хаалтаар: ${mn(period.pos)}\nШимтгэл ${fee}%: -${mn(posFee)}\nОрох ёстой: ${mn(posExpected)}\n` +
        `Орсон: **${mn(xac)}**\n${verdict(posDiff)}`,
      inline: true,
    })
    .setFooter({ text: '+ = илүү, − = дутуу. Пос-ын мөнгө маргааш нь орвол тэр 2 өдөрт зөрүү харагдана — нийт дүнг харна уу.' })
    .setTimestamp();

  if (dansTracked) {
    embed.addFields({
      name: `🏦 Данс → Хаан (${DANS_KEY})`,
      value: `Хаалтаар: ${mn(period.dans)}\nОрох ёстой: ${mn(period.dans)}\n\nОрсон: **${mn(khan)}**\n${verdict(dansDiff)}`,
      inline: true,
    });
  } else {
    embed.addFields({
      name: '🏦 Данс (Хаан банк)',
      value: `Хаалтаар: ${mn(period.dans)}\n_Хаан банк орлогын и-мэйл явуулдаггүй тул банктай тулгах боломжгүй._`,
      inline: true,
    });
  }

  // Бэлэн: хаалтын бэлэн орлогоос хаалтын зарлагыг хасаад үлдсэн нь бэлэн дансанд тушаагдах ёстой
  if (cashTracked) {
    const shouldDeposit = period.belen - period.zarlaga;
    const deposited = t.byAccount[CASH_KEY]?.in || 0;
    const left = Math.round(shouldDeposit - deposited);
    embed.addFields({
      name: `💵 Бэлэн → Хаан (${CASH_KEY})`,
      value: `Хаалтаар бэлэн: ${mn(period.belen)}\nХаалтын зарлага: -${mn(period.zarlaga)}\n` +
        `Тушаах ёстой: ${mn(shouldDeposit)}\nДансанд орсон: **${mn(deposited)}**\n` +
        (Math.abs(left) < 100 ? '✅ Бүгд тушаагдсан'
          : left > 0 ? `🟡 Тушаагаагүй (гарт): **${mn(left)}**` : `⚠️ Илүү орсон: **${mn(-left)}**`),
      inline: false,
    });
  }

  try {
    const balances = await getAccountBalances();
    if (balances.length) {
      embed.addFields({ name: '🏦 Дансны үлдэгдэл (одоо)', value: balances.map(balanceLine).join('\n').slice(0, 1000), inline: false });
    }
  } catch (err) {
    console.error('Дансны үлдэгдэл унших алдаа:', err.message);
  }

  if (salaryText) {
    embed.addFields({
      name: `💵 Цалингийн олголт (${addDays(to, -1)} ~ ${addDays(to, 5)}-ны шилжүүлэг)`,
      value: salaryText.slice(0, 1000),
      inline: false,
    });
  }
  return embed;
}

// Сарын 11, 26-ны өглөө (cron) — саяхан дууссан цалингийн хугацааны тулгалт #цалин руу
export async function sendTulgaltReport() {
  const channel = await client.channels.fetch(process.env.DISCORD_SALARY_CHANNEL_ID);
  const { from, to } = lastEndedPeriod();
  await channel.send({ embeds: [await buildReconcileEmbed(from, to)] });
}

export async function handleReconcileInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  // /tulgalt — энэ цалингийн хугацааны тулгалт (өнөөдрийг хүртэл)
  if (interaction.commandName === 'tulgalt') {
    await interaction.deferReply();
    try {
      const { from, to } = currentPeriodSoFar();
      await interaction.editReply({ embeds: [await buildReconcileEmbed(from, to)] });
    } catch (err) {
      console.error('tulgalt error:', err.message);
      await interaction.editReply('⚠️ Тулгалт гаргахад алдаа гарлаа.');
    }
    return true;
  }
  return false;
}
