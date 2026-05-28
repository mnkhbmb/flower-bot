// Discord bot — мэдэгдэл болон тайлан
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { getDailyReport, logAttendance, getSalaryReport } from './sheets.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
];

export async function startDiscord() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands }
  );

  client.once('ready', () => console.log(`✅ Discord bot: ${client.user.tag}`));

  // Командуудыг хариулах
  client.on('interactionCreate', async (interaction) => {
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

    // /irts
    if (interaction.commandName === 'irts') {
      try {
        await interaction.deferReply();
        const name = interaction.user.displayName || interaction.user.username;
        const type = interaction.options.getString('torol');
        const result = await logAttendance(name, type);
        const emoji = type === 'in' ? '🟢' : '🔴';
        const label = type === 'in' ? 'ирлээ' : 'гарлаа';
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
        console.error('Irts command error:', err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '⚠️ Ирц бүртгэхэд алдаа гарлаа.', ephemeral: true }).catch(() => {});
        }
      }
    }
  });

  // Unhandled error-уудыг барих
  client.on('error', (err) => console.error('Discord client error:', err));

  await client.login(process.env.DISCORD_BOT_TOKEN);
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
      { name: 'Үнэ', value: `${(order.qty * order.unitPrice).toLocaleString()}₮`, inline: true },
      { name: 'Хүргэлт', value: order.delivery ? `✅ ${order.address}` : '❌ Очиж авна', inline: true },
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] });
}

// Өдрийн тайлангийн embed
function dailyEmbed(r) {
  return new EmbedBuilder()
    .setColor(0x34A853)
    .setTitle(`📊 Өдрийн тайлан — ${r.date}`)
    .addFields(
      { name: 'Нийт орлого', value: `${r.revenue.toLocaleString()}₮`, inline: true },
      { name: 'Захиалга', value: `${r.count} ш`, inline: true },
      { name: 'Хүргэлт', value: `${r.deliveries} / ${r.count}`, inline: true },
    )
    .setTimestamp();
}

// Cron-оос дуудах — өдрийн тайлан автомат
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

// Цалингийн сануулга — сарын 10, 25-нд 12:00-д
export async function sendSalaryReminder() {
  const channel = await client.channels.fetch(process.env.DISCORD_SALARY_CHANNEL_ID);
  const { from, to } = getSalaryPeriod();
  const report = await getSalaryReport(from, to);

  // Ажилтны цалин (өдрөөр)
  const workerFields = Object.entries(report.workers).map(([name, data]) => ({
    name: `👩 ${name}`,
    value: `📅 ${data.days} өдөр · ⏱ ${data.hours} цаг · 💰 **${data.salary.toLocaleString()}₮**`,
    inline: false,
  }));

  // Захирлын тогтмол цалин
  const directorFields = DIRECTORS.map(d => ({
    name: `👑 ${d.name}`,
    value: `💰 **${d.amount.toLocaleString()}₮** (тогтмол)`,
    inline: false,
  }));

  const workerTotal = Object.values(report.workers).reduce((s, w) => s + w.salary, 0);
  const directorTotal = DIRECTORS.reduce((s, d) => s + d.amount, 0);
  const grandTotal = workerTotal + directorTotal;

  // Sheets-д хадгалах
  await saveSalaryToSheet(from, to, report.workers, DIRECTORS);

  const embed = new EmbedBuilder()
    .setColor(0xF4B400)
    .setTitle(`💵 Цалингийн тооцоо — ${from} ~ ${to}`)
    .addFields(...workerFields)
    .addFields({ name: '─────────────', value: '👑 **Захирлууд**', inline: false })
    .addFields(...directorFields)
    .addFields({ name: '─────────────', value: `**Нийт: ${grandTotal.toLocaleString()}₮**`, inline: false })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}
