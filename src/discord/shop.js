import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { client } from './client.js';
import { getDailyReport, saveHaalt, decreaseAguurlah, getTopSold, saveHorogdol, getYuanRate, setSetting } from '../services/sheets.js';
import { ubToday, addDays } from '../utils/periods.js';

// Өдрийн тайлангийн embed
function dailyEmbed(r) {
  return new EmbedBuilder()
    .setColor(0x34A853)
    .setTitle(`📊 Өдрийн тайлан — ${r.date}`)
    .addFields(
      { name: '💰 Нийт орлого', value: `${r.niit.toLocaleString()}₮`, inline: true },
      { name: '💵 Бэлэн', value: `${r.belen.toLocaleString()}₮`, inline: true },
      { name: '🏦 Данс', value: `${r.dans.toLocaleString()}₮`, inline: true },
      { name: '💳 Пос', value: `${r.pos.toLocaleString()}₮`, inline: true },
      { name: '🧾 Зарлага', value: `${r.zarlaga.toLocaleString()}₮`, inline: true },
      { name: '✅ Цэвэр орлого', value: `${r.tsever.toLocaleString()}₮`, inline: true },
    )
    .setFooter({ text: `${r.count} удаагийн хаалт` })
    .setTimestamp();
}

// Өдрийн тайланг #өдрийн-тайлан руу түлхэх.
// 22:00-ийн автомат cron-ыг зогсоосон тул одоо дуудагддаггүй —
// тайланг `/report` командаар хүссэн үедээ харна. Дахин автоматжуулах бол
// index.js-д cron.schedule нэмнэ.
export async function sendDailyReport() {
  const channel = await client.channels.fetch(process.env.DISCORD_REPORT_CHANNEL_ID);
  const r = await getDailyReport();
  await channel.send({ embeds: [dailyEmbed(r)] });
}

// Борлуулалтын эрэмбийн embed — /zarsan болон цалингийн мессежид хамт ашиглана
export function topSoldEmbed(r, title, max) {
  const rank = (items, n) => items.slice(0, n)
    .map((it, i) => `\`${String(i + 1).padStart(2)}.\` ${it.name} — **${it.qty.toLocaleString()}ш**`)
    .join('\n');
  const total = r.flowers.reduce((s, i) => s + i.qty, 0);

  const embed = new EmbedBuilder()
    .setColor(0xC9445A)
    .setTitle(title)
    .setDescription(r.flowers.length ? rank(r.flowers, max) : 'Энэ хугацаанд хаалтын задаргаа алга.')
    .setFooter({ text: `${r.from} ~ ${r.to} · ${r.days} өдрийн хаалт · нийт ${total.toLocaleString()} иш цэцэг` })
    .setTimestamp();

  if (r.others.length) {
    embed.addFields({ name: '🎀 Боодол, дагалдах бараа', value: rank(r.others, 8), inline: false });
  }
  if (r.unknown.length) {
    embed.addFields({
      name: '❓ Танигдаагүй товчлол',
      value: r.unknown.slice(0, 10).map(i => `${i.name} (${i.qty})`).join(', ').slice(0, 1000),
      inline: false,
    });
  }
  if (r.waste > 0) {
    embed.addFields({ name: '🥀 Хорогдол', value: `${r.waste.toLocaleString()}ш`, inline: true });
  }
  return embed;
}

// Хорогдол бүртгэх цонх — /horogdol болон хаалтын дараах товч хоёулаа үүнийг нээнэ
function horogdolModal() {
  return new ModalBuilder()
    .setCustomId('horogdol_modal')
    .setTitle('Хорогдол бүртгэх')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('horogdol')
          .setLabel('Хорогдсон цэцэг (товчлол-тоо)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Са-3 Ро-2\nЛили-1')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('shaltgaan')
          .setLabel('Шалтгаан (заавал биш)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Хатсан, хугарсан...')
          .setRequired(false)
      ),
    );
}

// Өдрийн хаалтын сануулга — өдөр бүр 20:00-д #өдрийн-хаалт руу
export async function sendHaaltReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_HAALT_CHANNEL_ID);
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle('🔔 Өдрийн хаалт бүртгүүлээрэй')
        .setDescription('Ажлын өдөр дуусч байна 🌸')
        .setTimestamp()
    ]
  });
}

// Бараа таталтын сануулга — Даваа гараг бүр 14:00-д #бараа-таталт руу.
// DISCORD_BARAA_ROLE_ID тохируулсан бол тэр role-г mention хийнэ, үгүй бол mention-гүй илгээнэ.
export async function sendBaraaReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_BARAA_CHANNEL_ID);
  const roleId = process.env.DISCORD_BARAA_ROLE_ID;
  await channel.send({
    content: roleId ? `<@&${roleId}> Захирлуудаа` : 'Захирлуудаа',
    allowedMentions: { roles: roleId ? [roleId] : [] },
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📦 Бараа таталтаа оруулаарай')
        .setDescription('Захирлуудаа, бараа таталтын баримтаа (зураг/PDF) энэ суваг руу хаяарай 🌸')
        .setTimestamp()
    ]
  });
}

// Хугацааны орлого/зарлагын нэгтгэл — цалингийн мессежтэй хамт явна
export function financeEmbed(r) {
  const mn = n => `${n.toLocaleString()}₮`;
  return new EmbedBuilder()
    .setColor(0x34A853)
    .setTitle(`💰 Орлого / Зарлага — ${r.from} ~ ${r.to}`)
    .addFields(
      { name: '💰 Нийт орлого', value: mn(r.niit), inline: true },
      { name: '🧾 Зарлага', value: mn(r.zarlaga), inline: true },
      { name: '✅ Цэвэр орлого', value: `**${mn(r.tsever)}**`, inline: true },
      { name: '💵 Бэлэн', value: mn(r.belen), inline: true },
      { name: '🏦 Данс', value: mn(r.dans), inline: true },
      { name: '💳 Пос', value: mn(r.pos), inline: true },
      { name: '📦 Бараа таталт', value: mn(r.baraa || 0), inline: true },
      { name: '💎 Бараа хассан ашиг', value: `**${mn(r.tsever - (r.baraa || 0))}**`, inline: true },
      { name: '​', value: '​', inline: true },
    )
    .setFooter({ text: `${r.days} өдрийн ${r.count} удаагийн хаалт` })
    .setTimestamp();
}

export async function handleShopInteraction(interaction) {
  // "Хорогдол нэмэх" товч (хаалтын хариун дээрх) → цонх нээнэ
  if (interaction.isButton() && interaction.customId === 'horogdol_open') {
    await interaction.showModal(horogdolModal());
    return true;
  }

  // Хорогдлын цонх илгээгдэхэд
  if (interaction.isModalSubmit() && interaction.customId === 'horogdol_modal') {
    try {
      await interaction.deferReply();
      const name = interaction.user.displayName || interaction.user.username;
      const text = interaction.fields.getTextInputValue('horogdol');
      const reason = interaction.fields.getTextInputValue('shaltgaan') || '';

      const items = await saveHorogdol({ name, text });
      if (!items.length) {
        await interaction.editReply('⚠️ Формат таарсангүй. Жишээ шиг бичнэ үү: `Са-3 Ро-2`');
        return true;
      }

      // Хорогдсон цэцгийг агуулахаас хасна
      const { warnings, unmatched } = await decreaseAguurlah(text);
      if (warnings.length > 0) {
        const warnChannel = await client.channels.fetch(process.env.DISCORD_WARNING_CHANNEL_ID);
        await warnChannel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🚨 Агуулах анхааруулга!')
            .setDescription(warnings.map(w =>
              `⚠️ **${w.ner}** (${w.tovch}) — үлдэгдэл: **${w.too}ш** (доод хэмжээ: ${w.threshold}ш)`).join('\n'))
            .setTimestamp()]
        });
      }

      const total = items.reduce((s, i) => s + i.too, 0);
      const channel = await client.channels.fetch(process.env.DISCORD_HAALT_CHANNEL_ID);
      const embed = new EmbedBuilder()
        .setColor(0x8E6B7A)
        .setTitle(`🥀 Хорогдол — ${name}`)
        .setDescription(items.map(i => `${i.tovch} — **${i.too}ш**`).join('\n'))
        .setFooter({ text: `Нийт ${total}ш` })
        .setTimestamp();
      if (reason) embed.addFields({ name: 'Шалтгаан', value: reason.slice(0, 1000), inline: false });
      await channel.send({ embeds: [embed] });

      await interaction.editReply(
        `✅ Хорогдол бүртгэгдлээ (${total}ш).` +
        (unmatched.length ? `\n⚠️ Агуулахаас олдоогүй тул хасагдаагүй: **${unmatched.join(', ')}**` : '')
      );
    } catch (err) {
      console.error('Horogdol modal error:', err);
      await interaction.editReply('⚠️ Хорогдол бүртгэхэд алдаа гарлаа.').catch(() => {});
    }
    return true;
  }

  // /haalt modal submit
  if (interaction.isModalSubmit() && interaction.customId === 'haalt_modal') {
    try {
      await interaction.deferReply();
      const name = interaction.user.displayName || interaction.user.username;
      const baglaa   = interaction.fields.getTextInputValue('baglaa');
      const belen    = Number(interaction.fields.getTextInputValue('belen').replace(/[^\d]/g, '')) || 0;
      const dans     = Number(interaction.fields.getTextInputValue('dans').replace(/[^\d]/g, '')) || 0;
      const pos      = Number(interaction.fields.getTextInputValue('pos').replace(/[^\d]/g, '')) || 0;
      const zarlaga  = interaction.fields.getTextInputValue('zarlaga');

      // Нийт орлого = Бэлэн + Данс + Пос (гараар оруулахгүй, алдаа гарахгүй)
      const niit = belen + dans + pos;

      // Зарлагын нийт тооцох
      const zarlLines = zarlaga.split('\n').filter(l => l.trim());
      const zarlTotal = zarlLines.reduce((sum, line) => {
        const match = line.match(/(\d+)/);
        return sum + (match ? Number(match[1]) : 0);
      }, 0);

      const tsever = niit - zarlTotal;

      // Sheets-д хадгалах
      await saveHaalt({ name, baglaa, niit, belen, dans, pos, zarlaga, zarlTotal, tsever });

      // Агуулахаас хасах + анхааруулга шалгах
      if (baglaa) {
        const { warnings, unmatched } = await decreaseAguurlah(baglaa);
        // Агуулахаас олдоогүй товчлолыг хаалт оруулсан хүнд шууд мэдэгдэнэ
        if (unmatched.length > 0) {
          await interaction.followUp({
            content: `⚠️ Эдгээр товчлол агуулахаас олдсонгүй, хасагдаагүй: **${unmatched.join(', ')}**\n` +
                     'Агуулахын "Товчлол" баганад нэмэх эсвэл зөв бичсэн эсэхээ шалгана уу.',
            ephemeral: true,
          }).catch(() => {});
        }
        if (warnings.length > 0) {
          const warnChannel = await client.channels.fetch(process.env.DISCORD_WARNING_CHANNEL_ID);
          const warnList = warnings.map(w =>
            `⚠️ **${w.ner}** (${w.tovch}) — үлдэгдэл: **${w.too}ш** (доод хэмжээ: ${w.threshold}ш)`
          ).join('\n');
          await warnChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚨 Агуулах анхааруулга!')
                .setDescription(warnList)
                .setTimestamp()
            ]
          });
        }
      }

      // #өдрийн-хаалт руу илгээх
      const channel = await client.channels.fetch(process.env.DISCORD_HAALT_CHANNEL_ID);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📋 Өдрийн хаалт — ${name}`)
            .addFields(
              { name: '📦 Баглаа', value: baglaa || '—', inline: false },
              { name: '💰 Нийт орлого', value: `${niit.toLocaleString()}₮`, inline: true },
              { name: '💵 Бэлэн', value: `${belen.toLocaleString()}₮`, inline: true },
              { name: '🏦 Данс | Пос', value: `${dans.toLocaleString()}₮ | ${pos.toLocaleString()}₮`, inline: true },
              { name: '🧾 Зарлага', value: zarlaga || '—', inline: false },
              { name: '📊 Зарлага нийт', value: `${zarlTotal.toLocaleString()}₮`, inline: true },
              { name: '✅ Цэвэр орлого', value: `**${tsever.toLocaleString()}₮**`, inline: true },
            )
            .setTimestamp()
        ]
      });

      await interaction.editReply({
        content: '✅ Өдрийн хаалт бүртгэгдлээ! Хорогдол гарсан бол доорх товчоор нэмнэ үү.',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('horogdol_open')
            .setLabel('Хорогдол нэмэх')
            .setEmoji('🥀')
            .setStyle(ButtonStyle.Secondary)
        )],
      });
    } catch (err) {
      console.error('Haalt modal error:', err);
      await interaction.editReply({ content: '⚠️ Хаалт бүртгэхэд алдаа гарлаа.' }).catch(() => {});
    }
    return true;
  }

  if (!interaction.isChatInputCommand()) return false;

  // /report
  if (interaction.commandName === 'report') {
    try {
      await interaction.deferReply();
      const r = await getDailyReport();
      await interaction.editReply({ embeds: [dailyEmbed(r)] });
    } catch (err) {
      console.error('Report command error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Тайлан авахад алдаа гарлаа.', ephemeral: true }).catch(() => {});
      }
    }
    return true;
  }

  // /haalt — modal нээх
  if (interaction.commandName === 'haalt') {
    const modal = new ModalBuilder()
      .setCustomId('haalt_modal')
      .setTitle('Өдрийн хаалт');

    const baglaaInput = new TextInputBuilder()
      .setCustomId('baglaa')
      .setLabel('Баглаа тэмдэглэл')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('1. Са-3 Ро-2 /Б/\n2. Уг-5 /П/')
      .setRequired(false);

    // Нийт орлогыг гараар авахгүй — Бэлэн + Данс + Пос-оос автоматаар бодно
    // (Discord modal 5 талбарын хязгаартай тул Данс, Пос-ыг салгахын тулд)
    const belenInput = new TextInputBuilder()
      .setCustomId('belen')
      .setLabel('Бэлэн')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('149500')
      .setRequired(false);

    const dansInput = new TextInputBuilder()
      .setCustomId('dans')
      .setLabel('Данс')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('433000')
      .setRequired(false);

    const posInput = new TextInputBuilder()
      .setCustomId('pos')
      .setLabel('Пос')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('50000')
      .setRequired(false);

    const zarlagaInput = new TextInputBuilder()
      .setCustomId('zarlaga')
      .setLabel('Зарлага')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('1. 50000 Амина хоол\n2. 20000 хогийн уут')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(baglaaInput),
      new ActionRowBuilder().addComponents(belenInput),
      new ActionRowBuilder().addComponents(dansInput),
      new ActionRowBuilder().addComponents(posInput),
      new ActionRowBuilder().addComponents(zarlagaInput),
    );

    await interaction.showModal(modal);
    return true;
  }

  // /hansh — юанийн ханш
  if (interaction.commandName === 'hansh') {
    await interaction.deferReply();
    try {
      const value = interaction.options.getNumber('yuan');
      if (value) {
        await setSetting('yuan_hansh', value);
        await interaction.editReply(`✅ Юанийн ханш: **1¥ = ${value.toLocaleString()}₮**. Одооноос юаниар ирсэн бараа таталт энэ ханшаар төгрөг болно.`);
      } else {
        const rate = await getYuanRate();
        await interaction.editReply(rate > 0
          ? `💱 Одоогийн ханш: **1¥ = ${rate.toLocaleString()}₮**. Өөрчлөх бол \`/hansh yuan:495\``
          : '⚠️ Юанийн ханш тохируулаагүй байна. `/hansh yuan:495` гэж оруулна уу.');
      }
    } catch (err) {
      console.error('hansh error:', err.message);
      await interaction.editReply('⚠️ Ханш хадгалахад алдаа гарлаа.');
    }
    return true;
  }

  // /horogdol — хорогдлын цонх нээх
  if (interaction.commandName === 'horogdol') {
    await interaction.showModal(horogdolModal());
    return true;
  }

  // /zarsan — хамгийн их зарагдсан цэцэг
  if (interaction.commandName === 'zarsan') {
    await interaction.deferReply();
    try {
      const days = interaction.options.getInteger('honog') ?? 30;
      const to = ubToday();
      const from = addDays(to, -(days - 1));
      const r = await getTopSold(from, to);

      const embed = topSoldEmbed(r, `🏆 Хамгийн их зарагдсан цэцэг — сүүлийн ${days} хоног`, 15);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('zarsan error:', err.message);
      await interaction.editReply('⚠️ Борлуулалтын тайлан гаргахад алдаа гарлаа.');
    }
    return true;
  }
  return false;
}
