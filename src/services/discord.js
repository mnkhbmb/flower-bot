// Discord bot — мэдэгдэл болон тайлан
import { REST, Routes } from 'discord.js';
import { client } from '../discord/client.js';
import { commands } from '../discord/commands.js';
import { handleBankInteraction } from '../discord/bank.js';
import { handleLoanInteraction, handleLoanReply } from '../discord/loans.js';
import { handleShopInteraction } from '../discord/shop.js';
import { handleStockInteraction, handleInvoiceMessage } from '../discord/stock.js';
import { handleSalaryInteraction } from '../discord/salary.js';
import { handleReconcileInteraction } from '../discord/reconcile.js';

export { salaryPeople } from '../discord/client.js';
export { notifyNewOrder, notifyWebOrder } from '../discord/orders.js';
export { notifyTransaction } from '../discord/bank.js';
export { sendTulgaltReport } from '../discord/reconcile.js';
export { sendDailyReport, sendHaaltReminder, sendBaraaReminder } from '../discord/shop.js';
export { sendSalaryReminder, sendSalaryPayReminder } from '../discord/salary.js';

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
    // Модуль бүр өөрийн autocomplete, цэс/товч, modal, командыг хариулна (true = боловсруулсан).
    // Autocomplete: bank, loans өөрийн командыг, salary үлдсэн бүгдийг (tsalin-unelgee) хариулдаг тул salary нь тэдний дараа байна.
    for (const handle of [handleBankInteraction, handleLoanInteraction, handleShopInteraction, handleStockInteraction, handleSalaryInteraction, handleReconcileInteraction]) {
      if (await handle(interaction)) return;
    }
  });

  // #бараа-таталт channel-д зураг/PDF хавсаргахад автоматаар уншина
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.reference?.messageId) {
      try {
        if (await handleLoanReply(message)) return;
      } catch (err) {
        console.error('zeel reply error:', err.message);
        await message.reply('⚠️ Зээлийн буцаалт бүртгэхэд алдаа гарлаа.').catch(() => {});
        return;
      }
    }
    await handleInvoiceMessage(message);
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
