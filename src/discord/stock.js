import { EmbedBuilder } from 'discord.js';
import { saveBaraa, increaseAguurlah, getAguurlah, manualAddAguurlah, addAguulahItem } from '../services/sheets.js';
import { readInvoice } from '../services/vision.js';

export async function handleStockInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  // /aguulah_nem
  if (interaction.commandName === 'aguulah_nem') {
    const tovch = interaction.options.getString('tovch');
    const too = interaction.options.getInteger('too');
    await interaction.deferReply();
    try {
      const result = await manualAddAguurlah(tovch, too);
      if (!result) {
        await interaction.editReply(`⚠️ **${tovch}** товчлол агуулахд олдсонгүй.`);
        return true;
      }
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x34A853)
          .setTitle('📦 Агуулах шинэчлэгдлээ')
          .addFields(
            { name: 'Бараа', value: `${result.ner} (${result.tovch})`, inline: true },
            { name: 'Өмнө', value: `${result.oldToo}ш`, inline: true },
            { name: 'Одоо', value: `**${result.newToo}ш**`, inline: true },
          )
          .setTimestamp()]
      });
    } catch (err) {
      console.error('aguulah_nem error:', err.message);
      await interaction.editReply('⚠️ Алдаа гарлаа.');
    }
    return true;
  }

  // /aguulah
  if (interaction.commandName === 'aguulah') {
    await interaction.deferReply();
    try {
      const items = await getAguurlah();
      const list = items.map(i => {
        const warn = i.too <= i.threshold ? '🔴' : i.too <= i.threshold * 2 ? '🟡' : '🟢';
        return `${warn} **${i.tovch}** ${i.ner} — ${i.too}ш`;
      }).join('\n');
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🏪 Агуулахын байдал')
          .setDescription(list || 'Мэдээлэл байхгүй')
          .setFooter({ text: '🔴 Дуусаж байна  🟡 Анхаар  🟢 Хангалттай' })
          .setTimestamp()]
      });
    } catch (err) {
      console.error('aguulah error:', err.message);
      await interaction.editReply('⚠️ Алдаа гарлаа.');
    }
    return true;
  }

  // /aguulah_shine — агуулахад шинэ бараа бүртгэх
  if (interaction.commandName === 'aguulah_shine') {
    await interaction.deferReply();
    try {
      const ner = interaction.options.getString('ner');
      const tovch = interaction.options.getString('tovch');
      const too = interaction.options.getInteger('too');
      const threshold = interaction.options.getInteger('anhaaruulga') ?? 5;

      const result = await addAguulahItem({ ner, tovch, too, threshold });
      if (!result.ok) {
        await interaction.editReply(
          result.reason === 'duplicate'
            ? `⚠️ **${result.tovch}** товчлол аль хэдийн ашиглагдсан байна. Өөр товчлол сонгоно уу.`
            : '⚠️ "Агуулах" tab олдсонгүй.'
        );
        return true;
      }
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x34A853)
          .setTitle('🆕 Шинэ бараа бүртгэгдлээ')
          .addFields(
            { name: 'Бараа', value: result.ner, inline: true },
            { name: 'Товчлол', value: result.tovch, inline: true },
            { name: 'Үлдэгдэл', value: `${result.too}ш`, inline: true },
          )
          .setFooter({ text: 'Одооноос /haalt дээр энэ товчлолыг таних болно' })
          .setTimestamp()]
      });
    } catch (err) {
      console.error('aguulah_shine error:', err.message);
      await interaction.editReply('⚠️ Бараа бүртгэхэд алдаа гарлаа.');
    }
    return true;
  }
  return false;
}

// #бараа-таталт channel-д зураг/PDF хавсаргахад автоматаар уншина
export async function handleInvoiceMessage(message) {
  if (message.channelId !== process.env.DISCORD_BARAA_CHANNEL_ID) return;
  if (message.attachments.size === 0) return;

  // Нэг мессежийн бүх зураг/PDF-ийг нэг баримтын хуудсууд гэж үзнэ
  const pages = [...message.attachments.values()].filter(a =>
    a.contentType?.startsWith('image/') || a.contentType?.includes('pdf') ||
    /\.(png|jpe?g|webp|gif|pdf)$/i.test(a.name || ''));
  if (pages.length === 0) return;

  const processing = await message.reply(pages.length > 1 ? `⏳ ${pages.length} хуудас баримт уншиж байна...` : '⏳ Баримт уншиж байна...');
  // "⏳" мессеж устгагдсан байвал edit оронд шинэ мессеж илгээнэ (10008-аас сэргийлнэ)
  const safeEdit = async (payload) => {
    try {
      await processing.edit(payload);
    } catch {
      await message.channel.send(typeof payload === 'string' ? payload : { ...payload }).catch(() => {});
    }
  };

  try {
    const invoice = await readInvoice(pages);
    const money = await saveBaraa(invoice);
    await increaseAguurlah(invoice.baraa);

    // Баримтын мөрүүдийг эх валютаар нь, нийт дүнг төгрөгөөр харуулна
    const sign = money.currency === 'CNY' ? '¥' : '₮';
    const unit = v => (money.currency === 'CNY' ? `¥${Number(v).toLocaleString()}` : `${Number(v).toLocaleString()}₮`);
    const itemList = invoice.baraa.slice(0, 10)
      .map((b, i) => `${i + 1}. ${b.ner} — ${b.too}ш × ${unit(b.negj)}`)
      .join('\n');
    const totalText = money.currency !== 'CNY'
      ? `${money.total.toLocaleString()}₮`
      : money.rate > 0
        ? `**${money.total.toLocaleString()}₮**\n¥${money.original.toLocaleString()} × ${money.rate.toLocaleString()}`
        : `¥${money.original.toLocaleString()}\n⚠️ Ханшгүй тул юаниар хадгаллаа. \`/hansh\` тохируулна уу.`;
    const more = invoice.baraa.length > 10 ? `\n... нийт ${invoice.baraa.length} төрөл` : '';

    await safeEdit({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor(0x34A853)
          .setTitle(`📦 Бараа таталт — Баримт №${invoice.barimtNo}`)
          .addFields(
            { name: '📅 Огноо', value: invoice.ogno || '—', inline: true },
            { name: '🏭 Нийлүүлэгч', value: invoice.nilluulegch || '—', inline: true },
            { name: `💰 Нийт дүн (${sign === '¥' ? 'юань → төгрөг' : 'төгрөг'})`, value: totalText, inline: true },
            { name: `📋 Бараа (${invoice.baraa.length} төрөл)`, value: itemList + more, inline: false },
          )
          .setTimestamp()
      ]
    });
  } catch (err) {
    console.error('Vision error:', err.message, err.status, err.code, err.stack?.slice(0, 300));
    await safeEdit(`⚠️ Алдаа: ${err.message || 'Тодорхойгүй алдаа'}`);
  }
}
