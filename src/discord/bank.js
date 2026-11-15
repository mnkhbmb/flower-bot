import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { client, PAY_CATS, salaryPeople, allPeople } from './client.js';
import { saveZeel, getTransaction, updateTransaction, removeZeelByTag, getTransactionTotals, setCounterpartyPerson, getAccountBalances, setAccountBalance, txAccountKey } from '../services/sheets.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, findPerson } from '../config/bankCategories.js';
import { shopAccounts } from '../services/bankParser.js';

// Банкны гүйлгээ (зардал) орж ирэхэд #зардал руу мэдэгдэл
export async function notifyTransaction(tx) {
  const channelId = process.env.DISCORD_ZARDAL_CHANNEL_ID;
  if (!channelId) {
    console.error('❌ DISCORD_ZARDAL_CHANNEL_ID тохируулаагүй — гүйлгээ явуулсангүй');
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (tx.balance == null) {
      const b = await getAccountBalances().then(list => list.find(x => x.account === txAccountKey(tx))).catch(() => null);
      if (b) tx = { ...tx, computedBalance: b.balance };
    }
    await channel.send(txMessage(tx, await allPeople()));
  } catch (err) {
    // Private суваг бол ботыг тэр сувагт нэмээгүй үед "Missing Access" гарна
    console.error(`❌ Гүйлгээний мэдэгдэл явуулж чадсангүй (суваг ${channelId}): ${err.message}. ` +
      'Сувгийн ID зөв эсэх, бот тэр сувгийг харах/бичих эрхтэй эсэхийг шалгана уу. Гүйлгээ sheet-д бичигдсэн.');
  }
}

// Гүйлгээний мэдэгдэл: embed + ангилал солих цэс (+ урьдчилгаа бол "хасахгүй" товч).
// Ангилал солиход ч энэ функцээр дахин зурна.
// "Хаан банк · Данс (*2668)" — аль данс болохыг дугаараар нь ялгаж харуулна
function accountLabel(tx) {
  const acc = shopAccounts().find(a => a.label === tx.account);
  const name = tx.account ? ` · ${tx.account}${acc ? ` (*${acc.id.slice(-4)})` : ''}` : '';
  return `${tx.bank || '—'}${name}`;
}

function txMessage(tx, people = salaryPeople()) {
  const isIncome = tx.txType === 'Орлого';
  const amountStr = tx.amount
    ? `**${isIncome ? '+' : '-'}${tx.amount.toLocaleString()}₮**`
    : '_тодорхойгүй_';

  const embed = new EmbedBuilder()
    .setColor(isIncome ? 0x2ECC71 : 0xE74C3C)
    .setTitle(isIncome ? '💵 Шинэ орлого' : '💸 Шинэ зарлага')
    .addFields(
      { name: '💰 Дүн', value: amountStr, inline: true },
      { name: '🏦 Данс', value: accountLabel(tx), inline: true },
      { name: '📅 Огноо', value: `${tx.date || '—'}${tx.time ? ` ${tx.time}` : ''}`, inline: true },
      { name: '📝 Утга', value: (tx.description || '—').slice(0, 1000), inline: false },
      ...(tx.counterparty
        ? [{ name: tx.txType === 'Орлого' ? '👤 Илгээгч' : '👤 Хүлээн авагч', value: tx.counterparty.slice(0, 200), inline: true }]
        : []),
      { name: '🏷️ Ангилал', value: `\`${tx.category || '—'}\``, inline: true },
    )
    .setFooter({ text: `"Гүйлгээ" tab · мөр ${tx.row}` })
    .setTimestamp();

  if (tx.balance != null) {
    embed.addFields({ name: '🧾 Үлдэгдэл', value: `${tx.balance.toLocaleString()}₮`, inline: true });
  } else if (tx.computedBalance != null) {
    embed.addFields({ name: '🧾 Үлдэгдэл (тооцоолсон)', value: `${tx.computedBalance.toLocaleString()}₮`, inline: true });
  }
  if (tx.category === 'Цалин') {
    embed.addFields({
      name: '👩 Цалин',
      value: tx.person ? `**${tx.person}**` : '_Хэнийх вэ? Доорх цэснээс сонгоно уу_',
      inline: false,
    });
  }
  const advance = tx.category === 'Урьдчилгаа' && tx.person;
  if (advance) {
    embed.addFields({
      name: '👩 Цалингаас хасна',
      value: `**${tx.person}** — ${tx.amount.toLocaleString()}₮ (Зээл tab-д бүртгэлээ)`,
      inline: false,
    });
  }
  // Дүн автоматаар олдоогүй бол эх и-мэйлийн гарчгийг харуулна (тохируулахад тус болно)
  if (tx.parsed === false && tx.subject) {
    embed.setFooter({ text: `⚠️ Дүн автоматаар олдсонгүй · ${tx.subject.slice(0, 80)}` });
  }

  const options = (isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
    .map(c => ({ label: c, value: c, default: c === tx.category }));
  const components = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`txcat:${tx.row}`)
        .setPlaceholder('📂 Ангилал солих')
        .addOptions(options),
    ),
  ];
  // Цалин/урьдчилгаа бол хэнд өгснийг сонгох цэс
  if (PAY_CATS.includes(tx.category) && people.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`txperson:${tx.row}`)
        .setPlaceholder(tx.person ? `👩 ${tx.person} (солих)` : '👩 Хэнд өгсөн бэ?')
        .addOptions(people.slice(0, 25).map(n => ({ label: n, value: n, default: n === tx.person }))),
    ));
  }
  if (advance) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`txnozeel:${tx.row}`)
        .setLabel('Цалингаас хасахгүй')
        .setStyle(ButtonStyle.Secondary),
    ));
  }
  return { embeds: [embed], components };
}

// Банкны бодит гүйлгээний нэгтгэл (ангиллаар). Хаалттай тулгалт — reconcileEmbed.
export function bankEmbed(t) {
  const mn = n => `${Math.round(n).toLocaleString()}₮`;
  const list = by => Object.entries(by)
    .sort((x, y) => y[1] - x[1])
    .map(([cat, amt]) => `${cat} — **${mn(amt)}**`)
    .join('\n') || '—';

  const embed = new EmbedBuilder()
    .setColor(0x1E88E5)
    .setTitle(`🏦 Банкны бодит гүйлгээ — ${t.from} ~ ${t.to}`)
    .addFields(
      { name: '💵 Орсон', value: `**${mn(t.income)}**`, inline: true },
      { name: '💸 Гарсан', value: `**${mn(t.expense)}**`, inline: true },
      { name: '🟰 Цэвэр', value: `**${mn(t.income - t.expense)}**`, inline: true },
      { name: 'Орлого (ангиллаар)', value: list(t.incomeBy).slice(0, 1000), inline: false },
      { name: 'Зарлага (ангиллаар)', value: list(t.expenseBy).slice(0, 1000), inline: false },
      {
        // Аль данснаас хэдэн төгрөг орж, гарсан бэ
        name: 'Данс тус бүрээр',
        value: Object.entries(t.byAccount || {})
          .map(([k, v]) => `${k}: +${mn(v.in)} / -${mn(v.out)}`)
          .join('\n').slice(0, 1000) || '—',
        inline: false,
      },
    )
    .setFooter({ text: `${t.count} гүйлгээ · өөрийн данс хоорондын шилжүүлгийг тооцоогүй` })
    .setTimestamp();

  return embed;
}

// ===== Дансны үлдэгдэл =====
// "Данс" → "Хаан банк · Данс (*2668)"
export function accountName(key) {
  const acc = shopAccounts().find(a => a.label === key);
  return acc ? `Хаан банк · ${key} (*${acc.id.slice(-4)})` : key;
}

// Тооцоолсон үлдэгдэл + банк и-мэйлдээ бичсэн үлдэгдэлтэй тулгасан нь
export function balanceLine(b) {
  let text = `**${accountName(b.account)}**: **${Math.round(b.balance).toLocaleString()}₮**` +
    `\n　${b.since}-с: ${Math.round(b.base).toLocaleString()}₮ · +${Math.round(b.in).toLocaleString()} / -${Math.round(b.out).toLocaleString()} (${b.count} гүйлгээ)`;
  if (b.bank) {
    const diff = Math.round(b.bank.balance - b.bank.computed);
    text += `\n　Банкны мэдээгээр (${b.bank.date} ${b.bank.time}): ${b.bank.balance.toLocaleString()}₮ ${Math.abs(diff) < 100 ? '✅' : `⚠️ зөрүү ${diff > 0 ? '+' : ''}${diff.toLocaleString()}₮`}`;
  }
  return text;
}

function balancesEmbed(list) {
  return new EmbedBuilder()
    .setColor(0x1E88E5)
    .setTitle('🏦 Дансны үлдэгдэл')
    .setDescription(list.length
      ? list.map(balanceLine).join('\n\n').slice(0, 4000)
      : 'Үлдэгдэл тохируулаагүй байна.\nЖишээ нь: `/dans-uldegdel dans:Данс dun:1250000`')
    .setFooter({ text: 'Хаан банк орлогын мэдэгдэл явуулдаггүй — орлого орсон бол банкны апп-аас хараад дахин тохируулна' })
    .setTimestamp();
}

// ===== Дансны тулгалт =====
// Хаалтын Пос → ХасБанкаар (банк шимтгэл хасаад) орно, Данс → Хаан банкаар бүтнээрээ орно.
export const POS_BANK = 'ХасБанк';
export const DANS_BANK = 'Хаан банк';
export const posFeePct = () => Number(process.env.POS_FEE_PERCENT ?? 1) || 0;

export async function handleBankInteraction(interaction) {
  if (interaction.isAutocomplete() && interaction.commandName === 'dans-uldegdel') {
    try {
      const typed = String(interaction.options.getFocused() || '').toLowerCase();
      const keys = [...new Set([...shopAccounts().map(a => a.label), POS_BANK, ...(await getAccountBalances()).map(b => b.account)])];
      await interaction.respond(keys.filter(k => accountName(k).toLowerCase().includes(typed)).slice(0, 25)
        .map(k => ({ name: accountName(k), value: k })));
    } catch {
      await interaction.respond([]).catch(() => {});
    }
    return true;
  }

  // Банкны гүйлгээний ангилал солих цэс
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('txcat:')) {
    await interaction.deferUpdate();
    try {
      const row = Number(interaction.customId.split(':')[1]);
      const category = interaction.values[0];
      const found = await getTransaction(row);
      if (!found) {
        await interaction.followUp({ content: '⚠️ Гүйлгээ sheet-ээс олдсонгүй.', ephemeral: true });
        return true;
      }
      const old = found.tx;
      const people = await allPeople();
      let person = old.person;
      let note = '';
      if (old.category === 'Урьдчилгаа' && category !== 'Урьдчилгаа') {
        await removeZeelByTag(`[tx:${row}]`);
        if (old.person) note = `↩️ Цалингаас хасахаа болилоо: **${old.person}**`;
      }
      // Цалин/Урьдчилгаа бол хэнд өгснийг хадгална (утга эсвэл хүлээн авагчийн нэрээс)
      if (!PAY_CATS.includes(category)) person = '';
      else if (!person) person = findPerson(`${old.description} ${old.counterparty}`, people) || '';
      if (category === 'Урьдчилгаа' && old.category !== 'Урьдчилгаа') {
        if (person && old.amount > 0) {
          await saveZeel({ name: person, amount: old.amount, date: old.date, note: `Банк: ${old.description || '—'} [tx:${row}]` });
          note = `💸 Цалингаас хасна: **${person}** — ${old.amount.toLocaleString()}₮`;
        } else {
          note = '👩 Хэнийх болохыг доорх цэснээс сонгоно уу.';
        }
      }
      if (['Зээл өгсөн', 'Зээл буцаалт'].includes(category)) {
        note = `ℹ️ Ангиллыг солилоо. Зээлийн үлдэгдэлд оруулах бол ${category === 'Зээл өгсөн' ? '`/zeel`' : '`/zeel-butsalt`'} ашиглана уу.`;
      }
      const tx = await updateTransaction(row, { category, person });
      await interaction.editReply(txMessage(tx, people));
      if (note) await interaction.followUp({ content: note, ephemeral: true });
    } catch (err) {
      console.error('txcat error:', err.message);
      await interaction.followUp({ content: '⚠️ Ангилал солиход алдаа гарлаа.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  // Цалин/урьдчилгаа хэнд өгснийг сонгох — хүлээн авагчийн нэрийг санаж дараа нь автоматаар танина
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('txperson:')) {
    await interaction.deferUpdate();
    try {
      const row = Number(interaction.customId.split(':')[1]);
      const person = interaction.values[0];
      const found = await getTransaction(row);
      if (!found) {
        await interaction.followUp({ content: '⚠️ Гүйлгээ sheet-ээс олдсонгүй.', ephemeral: true });
        return true;
      }
      const old = found.tx;
      if (old.category === 'Урьдчилгаа') {
        await removeZeelByTag(`[tx:${row}]`);
        if (old.amount > 0) {
          await saveZeel({ name: person, amount: old.amount, date: old.date, note: `Банк: ${old.description || '—'} [tx:${row}]` });
        }
      }
      const tx = await updateTransaction(row, { person });
      if (old.counterparty) await setCounterpartyPerson(old.counterparty, person);
      await interaction.editReply(txMessage(tx, await allPeople()));
      await interaction.followUp({
        content: `✅ **${person}**${old.category === 'Урьдчилгаа' ? ' — цалингаас хасна' : ''}.` +
          (old.counterparty ? ` Дараа нь **${old.counterparty}** руу шилжүүлбэл автоматаар танина.` : ''),
        ephemeral: true,
      });
    } catch (err) {
      console.error('txperson error:', err.message);
      await interaction.followUp({ content: '⚠️ Хадгалахад алдаа гарлаа.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  // "Цалингаас хасахгүй" товч — автоматаар бүртгэсэн урьдчилгааг буцаана
  if (interaction.isButton() && interaction.customId.startsWith('txnozeel:')) {
    await interaction.deferUpdate();
    try {
      const row = Number(interaction.customId.split(':')[1]);
      const found = await getTransaction(row);
      await removeZeelByTag(`[tx:${row}]`);
      const tx = await updateTransaction(row, { category: 'Цалин' });
      if (tx) await interaction.editReply(txMessage(tx, await allPeople()));
      await interaction.followUp({
        content: `↩️ Цалингаас хасахаа болиод "Цалин" гэж бүртгэлээ${found?.tx.person ? `: **${found.tx.person}**` : ''}. Өөр бол ангиллыг цэснээс сольно уу.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('txnozeel error:', err.message);
      await interaction.followUp({ content: '⚠️ Буцаахад алдаа гарлаа.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (!interaction.isChatInputCommand()) return false;

  // /guilgee — банкны бодит орлого / зарлага
  if (interaction.commandName === 'guilgee') {
    await interaction.deferReply();
    try {
      const days = interaction.options.getInteger('honog') ?? 30;
      const to = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const from = new Date(Date.now() + 8 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
      const t = await getTransactionTotals(from, to);
      await interaction.editReply({ embeds: [bankEmbed(t)] });
    } catch (err) {
      console.error('guilgee error:', err.message);
      await interaction.editReply('⚠️ Гүйлгээний тайлан гаргахад алдаа гарлаа.');
    }
    return true;
  }

  // /dans-uldegdel — дүнгүй бол үлдэгдлүүдийг харуулна, дүнтэй бол тэр мөчөөс шинээр тоолно
  if (interaction.commandName === 'dans-uldegdel') {
    await interaction.deferReply();
    try {
      const account = interaction.options.getString('dans');
      const amount = interaction.options.getInteger('dun');
      const balances = await getAccountBalances();
      if (account && amount != null) {
        const old = balances.find(b => b.account === account);
        const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
        await setAccountBalance(account, amount, stamp);
        const diff = old ? amount - old.balance : 0;
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x1E88E5)
            .setTitle(`🏦 Үлдэгдэл тохирууллаа — ${accountName(account)}`)
            .setDescription(`**${amount.toLocaleString()}₮** (${stamp})\n` +
              (old ? `Бот тооцоолсон: ${old.balance.toLocaleString()}₮ → ${Math.abs(diff) < 100 ? '✅ таарч байсан' : `⚠️ зөрүү **${diff > 0 ? '+' : ''}${diff.toLocaleString()}₮** (бүртгэгдээгүй ${diff > 0 ? 'орлого' : 'зарлага'})`}\n` : '') +
              '\nОдооноос хойш орсон, гарсан гүйлгээг энэ дүн дээр нэмж/хасаж явна.')
            .setTimestamp()],
        });
        return true;
      }
      const list = balances.filter(b => !account || b.account === account);
      await interaction.editReply({ embeds: [balancesEmbed(list)] });
    } catch (err) {
      console.error('dans-uldegdel error:', err.message);
      await interaction.editReply('⚠️ Дансны үлдэгдэл уншихад алдаа гарлаа.');
    }
    return true;
  }
  return false;
}
