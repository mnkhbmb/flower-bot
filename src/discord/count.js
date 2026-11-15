import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { client } from './client.js';
import { saveStockCount, applyStockCount } from '../services/sheets.js';

// Агуулахын тооллого: /toollogo → цонх → бүртгэл дээрх тоотой (анхны тоо) тулгана →
// "Агуулахыг засах" товчоор агуулахын тоог тоолсон тоогоор солино. Бүгд "Тооллого" tab-д хадгалагдана.

function toollogoModal() {
  return new ModalBuilder()
    .setCustomId('toollogo_modal')
    .setTitle('Агуулахын тооллого')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('toollogo')
          .setLabel('Тоолсон тоо (товчлол-тоо)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Са-45 Ро-12\nЛили-8 Ба-0')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('temdeglel')
          .setLabel('Тэмдэглэл (заавал биш)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
    );
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const signed = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function countEmbed(name, r, note, text) {
  const off = r.lines.filter(l => l.diff !== 0);
  const same = r.lines.filter(l => l.diff === 0);
  const desc = off.length
    ? off.map(l => `${l.diff < 0 ? '🔻' : '🔺'} **${l.ner}** — анхны ${l.before} → тоолсон ${l.counted} (**${signed(l.diff)}**)`).join('\n')
    : '✅ Тоолсон бүх бараа бүртгэлтэй таарч байна.';
  const embed = new EmbedBuilder()
    .setColor(off.length ? 0xE67E22 : 0x34A853)
    .setTitle(`🧮 Тооллого — ${name}`)
    .setDescription(cut(desc, 4000))
    .setTimestamp();
  // Ажилтны яг бичсэн зүйл — буруу танигдсан эсэхийг шалгахад
  if (text) embed.addFields({ name: '✍️ Оруулсан', value: cut(text.trim(), 1000) });
  if (same.length) embed.addFields({ name: `✅ Таарсан (${same.length})`, value: cut(same.map(l => `${l.ner} ${l.counted}`).join(', '), 1000) });
  // Тоолоогүй бараа цөөн бол нэрээр, олон бол зөвхөн тоогоор
  if (r.notCounted.length) embed.addFields({
    name: '➖ Тоолоогүй — өөрчлөгдөхгүй',
    value: r.notCounted.length <= 15 ? cut(r.notCounted.join(', '), 1000) : `${r.notCounted.length} бараа`,
  });
  if (r.unmatched.length) embed.addFields({ name: '❓ Танигдаагүй товчлол', value: cut(r.unmatched.join(', '), 1000) });
  if (note) embed.addFields({ name: 'Тэмдэглэл', value: cut(note, 1000) });
  const minus = off.filter(l => l.diff < 0).reduce((s, l) => s + l.diff, 0);
  const plus = off.filter(l => l.diff > 0).reduce((s, l) => s + l.diff, 0);
  embed.setFooter({ text: `Тоолсон ${r.lines.length} бараа · дутуу ${Math.abs(minus)}ш · илүү ${plus}ш` });
  return embed;
}

// Тооллогын сануулга — Даваа гараг бүр 10:00-д #өдрийн-хаалт руу
export async function sendToollogoReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_HAALT_CHANNEL_ID);
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle('🧮 Долоо хоногийн тооллогоо хийгээрэй')
        .setDescription('Агуулахаа тоолоод `/toollogo` командаар оруулаарай 🌸')
        .setTimestamp()
    ]
  });
}

// Товчийг давхар дарахад агуулахыг хоёр удаа засахаас сэргийлнэ
const applying = new Set();

export async function handleCountInteraction(interaction) {
  // Тооллогын цонх илгээгдэхэд
  if (interaction.isModalSubmit() && interaction.customId === 'toollogo_modal') {
    try {
      await interaction.deferReply();
      const name = interaction.user.displayName || interaction.user.username;
      const text = interaction.fields.getTextInputValue('toollogo');
      const note = interaction.fields.getTextInputValue('temdeglel') || '';
      const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString();   // Улаанбаатарын цаг
      const id = stamp.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

      const r = await saveStockCount({ id, date: stamp.slice(0, 10), time: stamp.slice(11, 16), name, text, note });
      if (!r) {
        await interaction.editReply('⚠️ "Агуулах" tab олдсонгүй.');
        return true;
      }
      if (!r.lines.length) {
        await interaction.editReply(r.unmatched.length
          ? `⚠️ Товчлол танигдсангүй: ${cut(r.unmatched.join(', '), 1500)}. \`/aguulah\`-аар товчлолоо шалгана уу.`
          : '⚠️ Формат таарсангүй. Жишээ шиг бичнэ үү: `Са-45 Ро-12`');
        return true;
      }

      const changed = r.lines.some(l => l.diff !== 0);
      await interaction.editReply({
        embeds: [countEmbed(name, r, note, text)],
        components: changed ? [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`toollogo_apply:${id}`)
            .setLabel('Агуулахыг тоолсон тоогоор засах')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
        )] : [],
      });
    } catch (err) {
      console.error('Toollogo modal error:', err);
      await interaction.editReply({ content: '⚠️ Тооллого бүртгэхэд алдаа гарлаа.' }).catch(() => {});
    }
    return true;
  }

  // "Агуулахыг засах" товч
  if (interaction.isButton() && interaction.customId.startsWith('toollogo_apply:')) {
    try {
      await interaction.deferUpdate();
      const id = interaction.customId.slice('toollogo_apply:'.length);
      const name = interaction.user.displayName || interaction.user.username;
      if (applying.has(id)) return true;
      applying.add(id);
      let r;
      try { r = await applyStockCount(id); } finally { applying.delete(id); }
      if (!r.ok && r.reason !== 'already') {
        await interaction.followUp({ content: '⚠️ Энэ тооллогын бүртгэл олдсонгүй.', ephemeral: true });
        return true;
      }
      const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x34A853);
      if (r.ok && !embed.data.fields?.some(f => f.name === '📦 Агуулах засагдлаа')) embed.addFields({ name: '📦 Агуулах засагдлаа', value: `${r.count} барааны тоог тоолсон тоогоор сольсон — ${name}` });
      await interaction.editReply({ embeds: [embed], components: [] });

      if (r.ok && r.warnings.length > 0) {
        const warnChannel = await client.channels.fetch(process.env.DISCORD_WARNING_CHANNEL_ID);
        await warnChannel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🚨 Агуулах анхааруулга!')
            .setDescription(cut(r.warnings.map(w =>
              `⚠️ **${w.ner}** — үлдэгдэл: **${w.too}ш** (доод хэмжээ: ${w.threshold}ш)`).join('\n'), 4000))
            .setTimestamp()]
        });
      }
    } catch (err) {
      console.error('Toollogo apply error:', err);
      await interaction.followUp({ content: '⚠️ Агуулахыг засахад алдаа гарлаа.', ephemeral: true }).catch(() => {});
    }
    return true;
  }

  if (!interaction.isChatInputCommand()) return false;

  // /toollogo
  if (interaction.commandName === 'toollogo') {
    await interaction.showModal(toollogoModal());
    return true;
  }

  return false;
}
