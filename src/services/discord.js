// Discord bot — мэдэгдэл болон тайлан
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { getDailyReport } from './sheets.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// /report команд бүртгэх
const commands = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Өнөөдрийн орлогын тайлан харах')
    .toJSON(),
];

export async function startDiscord() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands }
  );

  client.once('ready', () => console.log(`✅ Discord bot: ${client.user.tag}`));

  // /report командыг хариулах
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'report') {
      await interaction.deferReply();
      const r = await getDailyReport();
      await interaction.editReply({ embeds: [dailyEmbed(r)] });
    }
  });

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
