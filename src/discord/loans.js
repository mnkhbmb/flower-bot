import { EmbedBuilder } from 'discord.js';
import { client, allPeople } from './client.js';
import { saveZeel, getLoanBalances, getLoanRows } from '../services/sheets.js';
import { ubToday, currentPeriodSoFar } from '../utils/periods.js';
import { parseRepayText } from '../utils/ledger.js';

// ===== Зээлийн буцаалт =====
const LOAN_TITLE = '💸 Зээл бүртгэгдлээ';
const REPAY_TITLE = '↩️ Зээлийн буцаалт';
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const loanLine = l => `**${l.name}** — ${l.balance.toLocaleString()}₮ · ${l.since}-с${l.onSalary ? ' (цалингаас хасагдана)' : ''}`;

// Нийт төлөгдөөгүй зээл: ажилчин бишийг эхэнд, том дүнгээс нь
function loanOverviewEmbed(loans) {
  const sorted = [...loans].sort((a, b) => b.balance - a.balance);
  const section = (title, list) => (list.length ? [`${title}\n${list.map(loanLine).join('\n')}`] : []);
  const text = [
    ...section('🤝 **Бусад хүмүүс**', sorted.filter(l => !l.onSalary)),
    ...section('👩 **Ажилчид**', sorted.filter(l => l.onSalary)),
  ].join('\n\n');
  const total = loans.reduce((s, l) => s + l.balance, 0);
  return new EmbedBuilder()
    .setColor(0xE67E22)
    .setTitle(`📋 Зээлийн хяналт — нийт ${total.toLocaleString()}₮`)
    .setDescription(text.slice(0, 4000) || 'Төлөгдөөгүй зээл алга.')
    .setFooter({ text: 'Нэг хүний түүх: /zeel-hynah ner:Нэр' })
    .setTimestamp();
}

// Нэг хүний зээл, буцаалтын түүх (сүүлийн 20 мөр)
function loanHistoryEmbed(name, loans, rows) {
  const mine = rows.filter(r => sameName(r.name, name)).sort((a, b) => a.date.localeCompare(b.date));
  const lines = mine.slice(-20).map(r => {
    const note = r.note.replace(/\s*\[tx:\d+\]/, '').trim();
    return `${r.date} · ${r.amount < 0 ? '↩️' : '💸'} ${Math.abs(r.amount).toLocaleString()}₮${note ? ` · ${note}` : ''}`;
  });
  const loan = loans.find(l => sameName(l.name, name));
  const earlier = mine.length - lines.length;
  return new EmbedBuilder()
    .setColor(0xE67E22)
    .setTitle(`📋 Зээлийн түүх — ${mine[0]?.name || name}`)
    .setDescription(`${earlier > 0 ? `_өмнөх ${earlier} мөрийг алгаслаа_\n` : ''}${lines.join('\n') || 'Зээлийн бүртгэл алга.'}\n\nҮлдэгдэл: **${(loan?.balance || 0).toLocaleString()}₮**${loan?.onSalary ? ' (цалингаас хасагдана)' : ''}`.slice(0, 4000))
    .setTimestamp();
}

function openLoans() {
  return allPeople().then(people => getLoanBalances(currentPeriodSoFar().from, people));
}

// Буцаалтыг "Зээл" tab-д сөрөг дүнгээр бичнэ. Үлдэгдлээс илүүг авахгүй —
// илүү бичвэл цалин дээр нэмэгдэж, хүнд илүү мөнгө тооцогдоно.
async function repayLoan({ name, amount, note }) {
  const loan = (await openLoans()).find(l => sameName(l.name, name));
  if (!loan) return { error: `⚠️ **${name}**-д төлөгдөөгүй зээл алга. Цалинтай хүний өмнөх хугацааны зээл цалингаас нь хасагдсан.` };
  if (amount === 'all') amount = loan.balance;
  if (amount > loan.balance) return { error: `⚠️ Буцаалт үлдэгдлээс их байна. **${loan.name}**-ийн үлдэгдэл: **${loan.balance.toLocaleString()}₮**` };
  await saveZeel({ name: loan.name, amount: -amount, date: ubToday(), note: `Буцаалт${note ? `: ${note}` : ''}` });
  const left = loan.balance - amount;
  return {
    embed: new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle(REPAY_TITLE)
      .setDescription(`**${loan.name}** — ${amount.toLocaleString()}₮ буцаалаа${note ? `\n📝 ${note}` : ''}\n\n${left ? `Үлдэгдэл: **${left.toLocaleString()}₮**` : '✅ Зээл бүрэн төлөгдлөө'}${loan.onSalary ? '\nЦалингаас хасах дүн багасна.' : ''}`)
      .setFooter({ text: 'Дахин буцаалт: энэ мессежид дүнгээ reply бичнэ' })
      .setTimestamp(),
  };
}

// Ботын зээлийн мессежид дүн бичиж reply хийвэл буцаалт болгоно. Боловсруулсан бол true.
export async function handleLoanReply(message) {
  const parsed = parseRepayText(message.content);
  if (!parsed) return false;
  const ref = await message.fetchReference().catch(() => null);
  const embed = ref?.author.id === client.user.id ? ref.embeds[0] : null;
  if (![LOAN_TITLE, REPAY_TITLE].includes(embed?.title)) return false;
  const name = embed.description?.match(/^\*\*(.+?)\*\*/)?.[1];
  if (!name) return false;
  if (parsed.amount !== 'all' && parsed.amount < 1000) {
    await message.reply('⚠️ Дүнгээ бүтнээр нь бичнэ үү. Жишээ нь: 50000, 57к эсвэл бүгд');
    return true;
  }
  const result = await repayLoan({ name, ...parsed });
  await message.reply(result.error ? result.error : { embeds: [result.embed] });
  return true;
}

export async function handleLoanInteraction(interaction) {
  if (interaction.isAutocomplete() && ['zeel-hynah', 'zeel-butsalt', 'zeel'].includes(interaction.commandName)) {
    try {
      const typed = String(interaction.options.getFocused() || '').toLowerCase();
      if (interaction.commandName === 'zeel-hynah') {
        const names = [...new Set((await getLoanRows()).map(r => r.name))]
          .filter(n => n.toLowerCase().includes(typed)).slice(0, 25);
        await interaction.respond(names.map(n => ({ name: n, value: n })));
        return true;
      }
      if (interaction.commandName === 'zeel-butsalt') {
        const loans = (await openLoans()).filter(l => l.name.toLowerCase().includes(typed)).slice(0, 25);
        await interaction.respond(loans.map(l => ({ name: `${l.name} — ${l.balance.toLocaleString()}₮`, value: l.name })));
        return true;
      }
      if (interaction.commandName === 'zeel') {
        // Ажилчин биш зээлдэгчийг ч санал болгоно — нэр нь ижил бичигдэж үлдэгдэл нэгдэнэ
        const known = [...new Set([...(await openLoans()).map(l => l.name), ...(await allPeople())])];
        const people = known.filter(n => n.toLowerCase().includes(typed)).slice(0, 25);
        await interaction.respond(people.map(n => ({ name: n, value: n })));
        return true;
      }
    } catch {
      await interaction.respond([]).catch(() => {});
    }
    return true;
  }

  if (!interaction.isChatInputCommand()) return false;

  // /zeel — цалингаас өмнө авсан зээл/урьдчилгаа бүртгэх
  if (interaction.commandName === 'zeel') {
    await interaction.deferReply();
    try {
      const amount = interaction.options.getInteger('dun');
      const name = interaction.options.getString('ner')
        || interaction.user.displayName || interaction.user.username;
      const note = interaction.options.getString('temdeglel') || '';

      if (!amount || amount <= 0) {
        await interaction.editReply('⚠️ Дүн 0-ээс их байх ёстой.');
        return true;
      }

      await saveZeel({ name, amount, date: ubToday(), note });
      const onSalary = (await allPeople()).some(n => sameName(n, name));
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xE67E22)
          .setTitle(LOAN_TITLE)
          .setDescription(`**${name}** — ${amount.toLocaleString()}₮${note ? `\n📝 ${note}` : ''}\n\n${onSalary ? 'Энэ хугацааны цалингаас хасагдана.' : 'Цалингаас хасагдахгүй, буцаатал үлдэгдэлд байна.'}`)
          .setFooter({ text: 'Буцаалт: энэ мессежид дүнгээ reply бичнэ эсвэл /zeel-butsalt' })
          .setTimestamp()]
      });
    } catch (err) {
      console.error('zeel error:', err.message);
      await interaction.editReply('⚠️ Зээл бүртгэхэд алдаа гарлаа.');
    }
    return true;
  }

  // /zeel-hynah — төлөгдөөгүй зээлийн жагсаалт, нэр өгвөл тэр хүний түүх
  if (interaction.commandName === 'zeel-hynah') {
    await interaction.deferReply();
    try {
      const name = interaction.options.getString('ner');
      const [loans, rows] = await Promise.all([openLoans(), getLoanRows()]);
      await interaction.editReply({ embeds: [name ? loanHistoryEmbed(name, loans, rows) : loanOverviewEmbed(loans)] });
    } catch (err) {
      console.error('zeel-hynah error:', err.message);
      await interaction.editReply('⚠️ Зээлийн мэдээлэл уншихад алдаа гарлаа.');
    }
    return true;
  }

  // /zeel-butsalt — зээлийн буцаалт бүртгэх, нэр/дүнгүй бол үлдэгдэл харуулна
  if (interaction.commandName === 'zeel-butsalt') {
    await interaction.deferReply();
    try {
      const name = interaction.options.getString('ner');
      const amount = interaction.options.getInteger('dun');
      const note = interaction.options.getString('temdeglel') || '';
      if (name && amount) {
        const result = await repayLoan({ name, amount, note });
        await interaction.editReply(result.error ? result.error : { embeds: [result.embed] });
        return true;
      }
      const loans = (await openLoans()).filter(l => !name || sameName(l.name, name));
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xE67E22)
          .setTitle('💸 Төлөгдөөгүй зээл')
          .setDescription(`${loans.map(loanLine).join('\n') || 'Төлөгдөөгүй зээл алга.'}\n\nБуцаалт бүртгэх: \`/zeel-butsalt ner:Амина dun:50000\``)]
      });
    } catch (err) {
      console.error('zeel-butsalt error:', err.message);
      await interaction.editReply('⚠️ Зээлийн буцаалт бүртгэхэд алдаа гарлаа.');
    }
    return true;
  }
  return false;
}
