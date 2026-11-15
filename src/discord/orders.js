import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { client } from './client.js';

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
