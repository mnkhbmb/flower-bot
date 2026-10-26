// Discord bot — мэдэгдэл болон тайлан
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getDailyReport, logAttendance, getSalaryReport, saveHaalt, saveSalaryToSheet, saveBaraa, decreaseAguurlah, increaseAguurlah, getAguurlah, manualAddAguurlah, saveZeel, getAdvances, getPeriodReport, addAguulahItem, getTopSold, saveHorogdol, getYuanRate, setSetting, getSalaryRates, setSalaryRate, rateFor, getWorkerNames, DEFAULT_DAILY_RATE, getTransaction, updateTransaction, removeZeelByTag, getTransactionTotals } from './sheets.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, findPerson } from '../config/bankCategories.js';
import { readInvoice } from './vision.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Ажилтан: өдрөөр тооцох
const WORKERS = ['Туяа', 'Амина'];
// Захирал: тогтмол хагас сарын цалин
const DIRECTORS = [
  { name: 'Саруул', amount: 750000 },
  { name: 'Лулу',   amount: 750000 },
];

// Банкны утгаас нэр таних, урьдчилгааг цалингаас хасахад ашиглана
export function salaryPeople() {
  return [...WORKERS, ...DIRECTORS.map(d => d.name)];
}

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
    .setName('aguulah_shine')
    .setDescription('Агуулахад ШИНЭ бараа бүртгэх (хаалтад танигдаагүй товчлол гарвал)')
    .addStringOption(o => o.setName('ner').setDescription('Бараа нэр (ж: Цахирмаа)').setRequired(true))
    .addStringOption(o => o.setName('tovch').setDescription('Товчлол, таслалаар олноор (ж: цах,tsah)').setRequired(true))
    .addIntegerOption(o => o.setName('too').setDescription('Одоогийн үлдэгдэл').setRequired(true))
    .addIntegerOption(o => o.setName('anhaaruulga').setDescription('Анхааруулгын доод хэмжээ (default 5)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tsalin')
    .setDescription('Энэ хугацааны цалингийн тооцоо харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('hansh')
    .setDescription('Юанийн ханш харах / тохируулах (бараа таталтыг төгрөг болгоход)')
    .addNumberOption(o => o.setName('yuan').setDescription('1 юань = хэдэн төгрөг (ж: 495)')
      .setMinValue(1).setMaxValue(10000).setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('horogdol')
    .setDescription('Хорогдол (гэмтсэн, хаясан цэцэг) бүртгэх')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zarsan')
    .setDescription('Хамгийн их зарагдсан цэцэг (хаалтын мэдээллээс)')
    .addIntegerOption(o => o.setName('honog').setDescription('Сүүлийн хэдэн хоног (default 30)')
      .setMinValue(1).setMaxValue(365).setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zeel')
    .setDescription('Цалингаас өмнө авсан зээл/урьдчилгаа бүртгэх (цалингаас хасагдана)')
    .addIntegerOption(o => o.setName('dun').setDescription('Авсан дүн (₮)').setRequired(true))
    .addStringOption(o => o.setName('ner').setDescription('Хэн авсан бэ? (хоосон бол өөрийн нэр)').setRequired(false))
    .addStringOption(o => o.setName('temdeglel').setDescription('Тэмдэглэл').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tsalin-unelgee')
    .setDescription('Ажилтны өдрийн цалин харах / тохируулах (тохируулаагүй бол үндсэн дүнгээр)')
    .addStringOption(o => o.setName('ner').setDescription('Ажилтны нэр (Ирц дээрхтэй ижил)')
      .setRequired(false).setAutocomplete(true))
    .addIntegerOption(o => o.setName('dun').setDescription('Өдрийн цалин ₮ (0 = үндсэн дүнд буцаах)')
      .setMinValue(0).setMaxValue(10000000).setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tulgalt')
    .setDescription('Хаалтын Пос/Данс-ыг банкаар орсонтой тулгах (энэ цалингийн хугацаа)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('guilgee')
    .setDescription('Банкны бодит орлого / зарлага (ангиллаар)')
    .addIntegerOption(o => o.setName('honog').setDescription('Сүүлийн хэдэн хоног (default 30)')
      .setMinValue(1).setMaxValue(365).setRequired(false))
    .toJSON(),
];

export async function startDiscord() {
  console.log('🔄 Discord bot эхлүүлж байна...');

  // Bot ready болсны дараа командуудыг бүртгэнэ
  client.once('clientReady', async (c) => {
    console.log(`✅ Discord bot: ${c.user.tag}`);

    // Гүйлгээний суваг руу бичих эрхтэй эсэхийг эхэнд нь шалгаж логт хэлнэ
    const txChannel = process.env.DISCORD_ZARDAL_CHANNEL_ID;
    if (txChannel) {
      try {
        const ch = await c.channels.fetch(txChannel);
        const perms = ch.permissionsFor(c.user);
        const ok = perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks']);
        console.log(ok
          ? `✅ Гүйлгээний суваг: #${ch.name}`
          : `❌ #${ch.name} сувагт бот харах/бичих эрхгүй — сувгийн тохиргоонд ботыг нэмнэ үү`);
      } catch (err) {
        console.error(`❌ DISCORD_ZARDAL_CHANNEL_ID (${txChannel}) сувгийг олж чадсангүй: ${err.message}`);
      }
    }
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
      return;
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
          return;
        }
        const old = found.tx;
        let person = old.person;
        let note = '';
        if (old.category === 'Урьдчилгаа' && category !== 'Урьдчилгаа') {
          await removeZeelByTag(`[tx:${row}]`);
          if (old.person) note = `↩️ Цалингаас хасахаа болилоо: **${old.person}**`;
          person = '';
        }
        if (category === 'Урьдчилгаа' && old.category !== 'Урьдчилгаа') {
          const people = [...new Set([...salaryPeople(), ...(await getWorkerNames())])];
          person = findPerson(old.description, people) || '';
          if (person && old.amount > 0) {
            await saveZeel({ name: person, amount: old.amount, date: old.date, note: `Банк: ${old.description || '—'} [tx:${row}]` });
            note = `💸 Цалингаас хасна: **${person}** — ${old.amount.toLocaleString()}₮`;
          } else {
            note = '⚠️ Утгаас ажилтны нэр олдсонгүй. Хэнийх болохыг `/zeel`-ээр бүртгэнэ үү.';
          }
        }
        const tx = await updateTransaction(row, { category, person });
        await interaction.editReply(txMessage(tx));
        if (note) await interaction.followUp({ content: note, ephemeral: true });
      } catch (err) {
        console.error('txcat error:', err.message);
        await interaction.followUp({ content: '⚠️ Ангилал солиход алдаа гарлаа.', ephemeral: true }).catch(() => {});
      }
      return;
    }

    // "Цалингаас хасахгүй" товч — автоматаар бүртгэсэн урьдчилгааг буцаана
    if (interaction.isButton() && interaction.customId.startsWith('txnozeel:')) {
      await interaction.deferUpdate();
      try {
        const row = Number(interaction.customId.split(':')[1]);
        const found = await getTransaction(row);
        await removeZeelByTag(`[tx:${row}]`);
        const tx = await updateTransaction(row, { category: 'Бусад зарлага', person: '' });
        if (tx) await interaction.editReply(txMessage(tx));
        await interaction.followUp({
          content: `↩️ Цалингаас хасахаа болилоо${found?.tx.person ? `: **${found.tx.person}**` : ''}. Ангиллыг цэснээс сонгож болно.`,
          ephemeral: true,
        });
      } catch (err) {
        console.error('txnozeel error:', err.message);
        await interaction.followUp({ content: '⚠️ Буцаахад алдаа гарлаа.', ephemeral: true }).catch(() => {});
      }
      return;
    }

    // "Хорогдол нэмэх" товч (хаалтын хариун дээрх) → цонх нээнэ
    if (interaction.isButton() && interaction.customId === 'horogdol_open') {
      await interaction.showModal(horogdolModal());
      return;
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
          return;
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
      return;
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
          return;
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
      return;
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
      return;
    }

    // /horogdol — хорогдлын цонх нээх
    if (interaction.commandName === 'horogdol') {
      await interaction.showModal(horogdolModal());
      return;
    }

    // /zarsan — хамгийн их зарагдсан цэцэг
    if (interaction.commandName === 'zarsan') {
      await interaction.deferReply();
      try {
        const days = interaction.options.getInteger('honog') ?? 30;
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
        const r = await getTopSold(from, to);

        const embed = topSoldEmbed(r, `🏆 Хамгийн их зарагдсан цэцэг — сүүлийн ${days} хоног`, 15);
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('zarsan error:', err.message);
        await interaction.editReply('⚠️ Борлуулалтын тайлан гаргахад алдаа гарлаа.');
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
          return;
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
      return;
    }

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
      return;
    }

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

// Пиксел баглааны сайтаас ирсэн захиалга — харилцагчийн угсарсан зурагтай хамт
export async function notifyWebOrder(order, d, image) {
  const channel = await client.channels.fetch(process.env.DISCORD_ORDER_CHANNEL_ID);
  const ready = d.kind === 'ready';
  const embed = new EmbedBuilder()
    .setColor(ready ? 0xE23B41 : 0xC9445A)
    .setTitle(`${ready ? '💐 Бэлэн загварын захиалга' : '🎨 Пиксел баглааны захиалга'} ${order.orderId}`)
    .setDescription(`**${order.name}** · ${order.phone}`);

  if (ready) {
    embed.addFields({ name: '💐 Баглаа', value: d.product, inline: false });
  } else {
    embed.addFields(
      { name: `🌸 Цэцэг (${d.stems} иш)`, value: d.flowers || '—', inline: false },
      { name: '🌿 Чимэглэл', value: d.fillers || 'Байхгүй', inline: true },
      { name: '📄 Цаас', value: d.paper, inline: true },
      { name: '🎀 Тууз', value: d.ribbon, inline: true },
    );
  }

  embed
    .addFields(
      { name: '🕙 Хэзээ', value: d.when, inline: true },
      { name: '🚚 Хүлээн авах', value: order.delivery ? `Хүргэлт: ${order.address}` : 'Очиж авна', inline: true },
      { name: '🔁 Солих', value: d.allowSwap ? 'Зөвшөөрсөн' : '**Солихгүй**', inline: true },
    )
    .setFooter({ text: 'Үнээ баталгаажуулаад харилцагчтай холбогдоно уу' })
    .setTimestamp();

  if (d.message) embed.addFields({ name: '💌 Мэндчилгээний карт', value: `“${d.message}”`, inline: false });
  if (d.recipientName || d.recipientPhone) {
    embed.addFields({ name: '🎁 Хүлээн авагч', value: [d.recipientName, d.recipientPhone].filter(Boolean).join(' · '), inline: false });
  }
  if (d.note) embed.addFields({ name: '📝 Тэмдэглэл', value: d.note, inline: false });

  const payload = { embeds: [embed] };
  if (image) {
    embed.setImage('attachment://baglaa.png');
    payload.files = [new AttachmentBuilder(image, { name: 'baglaa.png' })];
  } else if (d.imageUrl) {
    embed.setImage(d.imageUrl);      // бэлэн загварын зураг сайтаас
  }
  await channel.send(payload);
}

// Банкны гүйлгээ (зардал) орж ирэхэд #зардал руу мэдэгдэл
export async function notifyTransaction(tx) {
  const channelId = process.env.DISCORD_ZARDAL_CHANNEL_ID;
  if (!channelId) {
    console.error('❌ DISCORD_ZARDAL_CHANNEL_ID тохируулаагүй — гүйлгээ явуулсангүй');
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send(txMessage(tx));
  } catch (err) {
    // Private суваг бол ботыг тэр сувагт нэмээгүй үед "Missing Access" гарна
    console.error(`❌ Гүйлгээний мэдэгдэл явуулж чадсангүй (суваг ${channelId}): ${err.message}. ` +
      'Сувгийн ID зөв эсэх, бот тэр сувгийг харах/бичих эрхтэй эсэхийг шалгана уу. Гүйлгээ sheet-д бичигдсэн.');
  }
}

// Гүйлгээний мэдэгдэл: embed + ангилал солих цэс (+ урьдчилгаа бол "хасахгүй" товч).
// Ангилал солиход ч энэ функцээр дахин зурна.
function txMessage(tx) {
  const isIncome = tx.txType === 'Орлого';
  const amountStr = tx.amount
    ? `**${isIncome ? '+' : '-'}${tx.amount.toLocaleString()}₮**`
    : '_тодорхойгүй_';

  const embed = new EmbedBuilder()
    .setColor(isIncome ? 0x2ECC71 : 0xE74C3C)
    .setTitle(isIncome ? '💵 Шинэ орлого' : '💸 Шинэ зарлага')
    .addFields(
      { name: '💰 Дүн', value: amountStr, inline: true },
      { name: '🏦 Банк', value: tx.bank || '—', inline: true },
      { name: '📅 Огноо', value: `${tx.date || '—'}${tx.time ? ` ${tx.time}` : ''}`, inline: true },
      { name: '📝 Утга', value: (tx.description || '—').slice(0, 1000), inline: false },
      { name: '🏷️ Ангилал', value: `\`${tx.category || '—'}\``, inline: true },
    )
    .setFooter({ text: `"Гүйлгээ" tab · мөр ${tx.row}` })
    .setTimestamp();

  if (tx.balance != null) {
    embed.addFields({ name: '🧾 Үлдэгдэл', value: `${tx.balance.toLocaleString()}₮`, inline: true });
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
function bankEmbed(t) {
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
    )
    .setFooter({ text: `${t.count} гүйлгээ · өөрийн данс хоорондын шилжүүлгийг тооцоогүй` })
    .setTimestamp();

  return embed;
}

// ===== Дансны тулгалт =====
// Хаалтын Пос → ХасБанкаар (банк шимтгэл хасаад) орно, Данс → Хаан банкаар бүтнээрээ орно.
const POS_BANK = 'ХасБанк';
const DANS_BANK = 'Хаан банк';
const posFeePct = () => Number(process.env.POS_FEE_PERCENT ?? 1) || 0;

// Улаанбаатарын өнөөдөр (YYYY-MM-DD) ба тооцоолох туслах
function ubToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

// Саяхан дууссан цалингийн хугацаа (11, 26-нд дуудна): 11 → өмнөх сарын 25 ~ 10, 26 → 10 ~ 25
function lastEndedPeriod() {
  const [y, m, d] = ubToday().split('-').map(Number);
  if (d >= 11 && d <= 25) return { from: ymd(y, m - 1, 25), to: ymd(y, m, 10) };
  if (d >= 26) return { from: ymd(y, m, 10), to: ymd(y, m, 25) };
  return { from: ymd(y, m - 1, 10), to: ymd(y, m - 1, 25) };
}

// Одоо явж буй хугацааны эхнээс өнөөдрийг хүртэл (/tulgalt)
function currentPeriodSoFar() {
  const today = ubToday();
  const [y, m, d] = today.split('-').map(Number);
  const from = d <= 10 ? ymd(y, m - 1, 25) : d <= 25 ? ymd(y, m, 10) : ymd(y, m, 25);
  return { from, to: today };
}

async function buildReconcileEmbed(from, to) {
  const [period, t] = await Promise.all([getPeriodReport(from, to), getTransactionTotals(from, to)]);
  const mn = n => `${Math.round(n).toLocaleString()}₮`;
  const fee = posFeePct();
  const mark = diff => (Math.abs(diff) < 100 ? '✅' : `⚠️ ${diff > 0 ? '+' : ''}${mn(diff)}`);

  const posFee = Math.round(period.pos * fee / 100);
  const posExpected = period.pos - posFee;
  const xac = t.salesByBank[POS_BANK] || 0;
  const khan = t.salesByBank[DANS_BANK] || 0;
  const posDiff = Math.round(xac - posExpected);
  const dansDiff = Math.round(khan - period.dans);

  // Өдөр бүрээр: хаалтын өдөр болон банкны өдрийг нэгтгэнэ
  const days = [...new Set([...Object.keys(period.byDay || {}), ...Object.keys(t.salesByDay)])].sort();
  const lines = days.map(day => {
    const h = (period.byDay || {})[day] || { dans: 0, pos: 0 };
    const b = t.salesByDay[day] || {};
    const p = Math.round((b[POS_BANK] || 0) - h.pos * (1 - fee / 100));
    const dn = Math.round((b[DANS_BANK] || 0) - h.dans);
    return `\`${day.slice(5)}\` Пос ${mark(p)} · Данс ${mark(dn)}`;
  });
  let daily = lines.join('\n') || 'Энэ хугацаанд бүртгэл алга.';
  if (daily.length > 3500) daily = daily.slice(0, 3500) + '\n…';

  const allOk = Math.abs(posDiff) < 100 && Math.abs(dansDiff) < 100;
  return new EmbedBuilder()
    .setColor(allOk ? 0x2ECC71 : 0xE67E22)
    .setTitle(`🔎 Дансны тулгалт — ${from} ~ ${to}`)
    .setDescription(`**Өдрөөр**\n${daily}`)
    .addFields(
      {
        name: `💳 Пос → ${POS_BANK}`,
        value: `Хаалтаар: ${mn(period.pos)}\nШимтгэл ${fee}%: -${mn(posFee)}\nОрох ёстой: ${mn(posExpected)}\n` +
          `Орсон: **${mn(xac)}**\n${Math.abs(posDiff) < 100 ? '✅ Таарч байна' : `⚠️ Зөрүү: **${posDiff > 0 ? '+' : ''}${mn(posDiff)}**`}`,
        inline: true,
      },
      {
        name: `🏦 Данс → ${DANS_BANK}`,
        value: `Хаалтаар: ${mn(period.dans)}\nОрох ёстой: ${mn(period.dans)}\n\n` +
          `Орсон: **${mn(khan)}**\n${Math.abs(dansDiff) < 100 ? '✅ Таарч байна' : `⚠️ Зөрүү: **${dansDiff > 0 ? '+' : ''}${mn(dansDiff)}**`}`,
        inline: true,
      },
    )
    .setFooter({ text: '+ = банкаар илүү орсон, − = дутуу. Пос-ын мөнгө маргааш нь орвол тэр 2 өдөрт зөрүү харагдана — нийт дүнг харна уу.' })
    .setTimestamp();
}

// Сарын 11, 26-ны өглөө (cron) — саяхан дууссан цалингийн хугацааны тулгалт #цалин руу
export async function sendTulgaltReport() {
  const channel = await client.channels.fetch(process.env.DISCORD_SALARY_CHANNEL_ID);
  const { from, to } = lastEndedPeriod();
  await channel.send({ embeds: [await buildReconcileEmbed(from, to)] });
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
  try {
    const t = await getTransactionTotals(from, to);
    if (t.count) financeEmbeds.push(bankEmbed(t));
  } catch (err) {
    console.error('Банкны гүйлгээ унших алдаа:', err.message);
  }

  // Тухайн хугацаанд хамгийн их зарагдсан цэцэг (Хаалт задаргаа tab-аас)
  let topEmbeds = [];
  try {
    const top = await getTopSold(from, to);
    if (top.flowers.length) {
      topEmbeds = [topSoldEmbed(top, `🏆 Хамгийн их зарагдсан цэцэг — ${from} ~ ${to}`, 10)];
    }
  } catch (err) {
    console.error('Борлуулалтын эрэмбэ унших алдаа:', err.message);
  }

  return [embed, attendanceEmbed(report), ...financeEmbeds, ...topEmbeds];
}

// Борлуулалтын эрэмбийн embed — /zarsan болон цалингийн мессежид хамт ашиглана
function topSoldEmbed(r, title, max) {
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

// Бараа таталтын сануулга — өдөр бүр 14:00-д #бараа-таталт руу.
// DISCORD_BARAA_ROLE_ID тохируулсан бол тэр role-г mention хийнэ.
export async function sendBaraaReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_BARAA_CHANNEL_ID);
  const roleId = process.env.DISCORD_BARAA_ROLE_ID || '1510417114983432413';
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
      { name: '📦 Бараа таталт', value: mn(r.baraa || 0), inline: true },
      { name: '💎 Бараа хассан ашиг', value: `**${mn(r.tsever - (r.baraa || 0))}**`, inline: true },
      { name: '​', value: '​', inline: true },
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
