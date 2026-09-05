// Discord bot — мэдэгдэл болон тайлан
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getDailyReport, logAttendance, getSalaryReport, saveHaalt, saveSalaryToSheet, saveBaraa, decreaseAguurlah, increaseAguurlah, getAguurlah, manualAddAguurlah, saveZeel, getAdvances, getPeriodReport } from './sheets.js';
import { readInvoice } from './vision.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Ажилтан: өдрөөр тооцох
const WORKERS = ['Туяа', 'Амина'];
// Захирал: тогтмол хагас сарын цалин
const DIRECTORS = [
  { name: 'Саруул', amount: 750000 },
  { name: 'Лулу',   amount: 750000 },
];

// Командууд бүртгэх
const commands = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Өнөөдрийн орлогын тайлан харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('irts')
    .setDescription('Ирц бүртгэх')
    .addStringOption(o => o.setName('torol').setDescription('Ирсэн/Гарсан').setRequired(true)
      .addChoices(
        { name: '🟢 Ирлээ', value: 'in' },
        { name: '🔴 Гарлаа', value: 'out' },
      ))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('haalt')
    .setDescription('Өдрийн хаалт оруулах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('aguulah_nem')
    .setDescription('Агуулахд бараа нэмэх')
    .addStringOption(o => o.setName('tovch').setDescription('Товчлол (Са, Ро, Ба...)').setRequired(true))
    .addIntegerOption(o => o.setName('too').setDescription('Нэмэх тоо').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('aguulah')
    .setDescription('Агуулахын одоогийн байдал харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tsalin')
    .setDescription('Энэ хугацааны цалингийн тооцоо харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zeel')
    .setDescription('Цалингаас өмнө авсан зээл/урьдчилгаа бүртгэх (цалингаас хасагдана)')
    .addIntegerOption(o => o.setName('dun').setDescription('Авсан дүн (₮)').setRequired(true))
    .addStringOption(o => o.setName('ner').setDescription('Хэн авсан бэ? (хоосон бол өөрийн нэр)').setRequired(false))
    .addStringOption(o => o.setName('temdeglel').setDescription('Тэмдэглэл').setRequired(false))
    .toJSON(),
];

export async function startDiscord() {
  console.log('🔄 Discord bot эхлүүлж байна...');

  // Bot ready болсны дараа командуудыг бүртгэнэ
  client.once('clientReady', async (c) => {
    console.log(`✅ Discord bot: ${c.user.tag}`);
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Командууд бүртгэгдлээ');
    } catch (err) {
      console.error('❌ Команд бүртгэх алдаа:', err.message);
    }
  });

  client.on('error', (err) => console.error('❌ Discord error:', err.message));

  // Командууд болон modal submit хариулах
  client.on('interactionCreate', async (interaction) => {

    // /haalt modal submit
    if (interaction.isModalSubmit() && interaction.customId === 'haalt_modal') {
      try {
        await interaction.deferReply();
        const name = interaction.user.displayName || interaction.user.username;
        const baglaa   = interaction.fields.getTextInputValue('baglaa');
        const niit     = Number(interaction.fields.getTextInputValue('niit').replace(/[^\d]/g, '')) || 0;
        const belen    = Number(interaction.fields.getTextInputValue('belen').replace(/[^\d]/g, '')) || 0;
        const dansPosRaw = interaction.fields.getTextInputValue('dans_pos');
        const zarlaga  = interaction.fields.getTextInputValue('zarlaga');

        // Данс | Пос задлах
        const [dansStr, posStr] = dansPosRaw.split('|').map(s => s.trim());
        const dans = Number(dansStr?.replace(/[^\d]/g, '')) || 0;
        const pos  = Number(posStr?.replace(/[^\d]/g, ''))  || 0;

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
          const warnings = await decreaseAguurlah(baglaa);
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

        await interaction.editReply({ content: '✅ Өдрийн хаалт бүртгэгдлээ!' });
      } catch (err) {
        console.error('Haalt modal error:', err);
        await interaction.editReply({ content: '⚠️ Хаалт бүртгэхэд алдаа гарлаа.' }).catch(() => {});
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

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

      const niitInput = new TextInputBuilder()
        .setCustomId('niit')
        .setLabel('Нийт орлого')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('632500')
        .setRequired(true);

      const belenInput = new TextInputBuilder()
        .setCustomId('belen')
        .setLabel('Бэлэн')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('149500')
        .setRequired(false);

      const dansPosInput = new TextInputBuilder()
        .setCustomId('dans_pos')
        .setLabel('Данс | Пос  (|  -р тусгаарлана)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('433000 | 50000')
        .setRequired(false);

      const zarlagaInput = new TextInputBuilder()
        .setCustomId('zarlaga')
        .setLabel('Зарлага')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1. 50000 Амина хоол\n2. 20000 хогийн уут')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(baglaaInput),
        new ActionRowBuilder().addComponents(niitInput),
        new ActionRowBuilder().addComponents(belenInput),
        new ActionRowBuilder().addComponents(dansPosInput),
        new ActionRowBuilder().addComponents(zarlagaInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // /aguulah_nem
    if (interaction.commandName === 'aguulah_nem') {
      const tovch = interaction.options.getString('tovch');
      const too = interaction.options.getInteger('too');
      await interaction.deferReply();
      try {
        const result = await manualAddAguurlah(tovch, too);
        if (!result) {
          await interaction.editReply(`⚠️ **${tovch}** товчлол агуулахд олдсонгүй.`);
          return;
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
      return;
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
      return;
    }

    // /tsalin — энэ хугацааны цалин харах (sheet-д хадгалахгүй, зөвхөн харна)
    if (interaction.commandName === 'tsalin') {
      await interaction.deferReply();
      try {
        const { from, to } = getSalaryPeriod();
        const embeds = await buildSalaryEmbed(from, to, { save: false });
        await interaction.editReply({ embeds });
      } catch (err) {
        console.error('tsalin error:', err.message);
        await interaction.editReply('⚠️ Цалин тооцоход алдаа гарлаа.');
      }
      return;
    }

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
          return;
        }

        await saveZeel({ name, amount, note });
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle('💸 Зээл бүртгэгдлээ')
            .setDescription(`**${name}** — ${amount.toLocaleString()}₮${note ? `\n📝 ${note}` : ''}\n\nЭнэ хугацааны цалингаас хасагдана.`)
            .setTimestamp()]
        });
      } catch (err) {
        console.error('zeel error:', err.message);
        await interaction.editReply('⚠️ Зээл бүртгэхэд алдаа гарлаа.');
      }
      return;
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
    }
  });

  // #бараа-таталт channel-д зураг/PDF хавсаргахад автоматаар уншина
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channelId !== process.env.DISCORD_BARAA_CHANNEL_ID) return;
    if (message.attachments.size === 0) return;

    const attachment = message.attachments.first();
    const isImage = attachment.contentType?.startsWith('image/');
    const isPdf   = attachment.contentType?.includes('pdf');
    if (!isImage && !isPdf) return;

    const processing = await message.reply('⏳ Баримт уншиж байна...');
    // "⏳" мессеж устгагдсан байвал edit оронд шинэ мессеж илгээнэ (10008-аас сэргийлнэ)
    const safeEdit = async (payload) => {
      try {
        await processing.edit(payload);
      } catch {
        await message.channel.send(typeof payload === 'string' ? payload : { ...payload }).catch(() => {});
      }
    };

    try {
      const invoice = await readInvoice(attachment);
      await saveBaraa(invoice);
      await increaseAguurlah(invoice.baraa);

      const itemList = invoice.baraa.slice(0, 10)
        .map((b, i) => `${i + 1}. ${b.ner} — ${b.too}ш × ${Number(b.negj).toLocaleString()}₮`)
        .join('\n');
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
              { name: '💰 Нийт дүн', value: `${Number(invoice.niitDun).toLocaleString()}₮`, inline: true },
              { name: `📋 Бараа (${invoice.baraa.length} төрөл)`, value: itemList + more, inline: false },
            )
            .setTimestamp()
        ]
      });
    } catch (err) {
      console.error('Vision error:', err.message, err.status, err.code, err.stack?.slice(0, 300));
      await safeEdit(`⚠️ Алдаа: ${err.message || 'Тодорхойгүй алдаа'}`);
    }
  });

  // Unhandled error-уудыг барих
  client.on('error', (err) => console.error('Discord client error:', err));

  try {
    console.log('🔄 Discord login хийж байна...');
    await client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('✅ Discord login амжилттай');
  } catch (err) {
    console.error('❌ Discord login алдаа:', err.message, err.code);
  }
}

// Шинэ захиалга орох үед мэдэгдэл
export async function notifyNewOrder(order) {
  const channel = await client.channels.fetch(process.env.DISCORD_ORDER_CHANNEL_ID);
  const embed = new EmbedBuilder()
    .setColor(0xC9445A)
    .setTitle(`🆕 Шинэ захиалга ${order.orderId}`)
    .setDescription(`**${order.name}** · ${order.phone}`)
    .addFields(
      { name: 'Цэцэг', value: `${order.flower} x${order.qty}`, inline: true },
      { name: 'Үнэ', value: order.unitPrice ? `${(order.qty * order.unitPrice).toLocaleString()}₮` : 'Ажилтан тогтооно', inline: true },
      { name: 'Хүргэлт', value: order.delivery ? `✅ ${order.address}` : '❌ Очиж авна', inline: true },
    )
    .setTimestamp();
  // Харилцагчийн явуулсан зураг/тэмдэглэл байвал хавсаргана
  if (order.note) {
    embed.addFields({ name: '📝 Тэмдэглэл', value: order.note.slice(0, 1000), inline: false });
  }
  await channel.send({ embeds: [embed] });
}

// Банкны гүйлгээ (зардал) орж ирэхэд #зардал руу мэдэгдэл
export async function notifyTransaction(tx) {
  const channelId = process.env.DISCORD_ZARDAL_CHANNEL_ID;
  if (!channelId) {
    console.error('❌ DISCORD_ZARDAL_CHANNEL_ID тохируулаагүй — гүйлгээ явуулсангүй');
    return;
  }
  const channel = await client.channels.fetch(channelId);

  const isIncome = tx.txType === 'Орлого';
  const sign = isIncome ? '+' : '-';
  const amountStr = tx.amount != null
    ? `**${sign}${tx.amount.toLocaleString()}₮**`
    : '_тодорхойгүй_';

  const embed = new EmbedBuilder()
    .setColor(isIncome ? 0x2ECC71 : 0xE74C3C)
    .setTitle(isIncome ? '💵 Шинэ орлого' : '💸 Шинэ зардал')
    .addFields(
      { name: '💰 Дүн', value: amountStr, inline: true },
      { name: '🏦 Банк', value: tx.bank || '—', inline: true },
      { name: '📅 Огноо', value: tx.date || '—', inline: true },
      { name: '📝 Утга', value: tx.description || '—', inline: false },
    )
    .setTimestamp();

  if (tx.balance != null) {
    embed.addFields({ name: '🧾 Үлдэгдэл', value: `${tx.balance.toLocaleString()}₮`, inline: true });
  }
  // regex дүн олоогүй бол эх и-мэйлийн гарчгийг нэмж харуулна (тохируулахад тус болно)
  if (!tx.parsed && tx.subject) {
    embed.setFooter({ text: `⚠️ Дүн автоматаар олдсонгүй · ${tx.subject.slice(0, 80)}` });
  }

  await channel.send({ embeds: [embed] });
}

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

// Цалингийн хугацааг тооцох
function getSalaryPeriod() {
  const now = new Date();
  const day = now.getDate();
  const yyyy = now.toISOString().slice(0, 4);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prevMm = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');
  const prevYyyy = now.getMonth() === 0 ? String(now.getFullYear() - 1) : yyyy;

  if (day === 10) {
    // 25-аас 10 хүртэл
    return { from: `${prevYyyy}-${prevMm}-25`, to: `${yyyy}-${mm}-10` };
  } else {
    // 10-аас 25 хүртэл
    return { from: `${yyyy}-${mm}-10`, to: `${yyyy}-${mm}-25` };
  }
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
      value: `📅 ${data.days} өдөр · ⏱ ${data.hours} цаг\n${line(data.salary, adv)}`,
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
  try {
    financeEmbeds = [financeEmbed(await getPeriodReport(from, to))];
  } catch (err) {
    console.error('Хугацааны орлого унших алдаа:', err.message);
  }

  return [embed, attendanceEmbed(report), ...financeEmbeds];
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

// Бараа таталтын сануулга — 7 хоног тутам #бараа-таталт руу.
// DISCORD_BARAA_ROLE_ID тохируулсан бол тэр role-г mention хийнэ.
export async function sendBaraaReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_BARAA_CHANNEL_ID);
  const roleId = process.env.DISCORD_BARAA_ROLE_ID;
  await channel.send({
    content: roleId ? `<@&${roleId}>` : undefined,
    allowedMentions: { roles: roleId ? [roleId] : [] },
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📦 Бараа таталтаа оруулаарай')
        .setDescription('Энэ 7 хоногийн бараа таталтын баримтаа (зураг/PDF) энэ суваг руу хаяарай 🌸')
        .setTimestamp()
    ]
  });
}

// Хугацааны орлого/зарлагын нэгтгэл — цалингийн мессежтэй хамт явна
function financeEmbed(r) {
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
    )
    .setFooter({ text: `${r.days} өдрийн ${r.count} удаагийн хаалт` })
    .setTimestamp();
}

// Цалингийн сануулга — сарын 10, 25-нд 12:00-д (cron). Sheet-д хадгална.
export async function sendSalaryReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_SALARY_CHANNEL_ID);
  const { from, to } = getSalaryPeriod();
  const embeds = await buildSalaryEmbed(from, to, { save: true });
  await channel.send({ embeds });
}
