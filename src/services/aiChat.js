// AI чат — үйлчлүүлэгчийн чөлөөт асуултад Claude-аар хариулах
import Anthropic from '@anthropic-ai/sdk';
import { CATALOG, PAYMENT_INFO, BOUQUET_ALBUM_URL, SHOW_PRICES, SHOP_INFO } from '../config/catalog.js';
import { getFlowerTypes } from './sheets.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Текст асуултад — хямд, хурдан загвар. Зураг танихад — vision загвар.
const TEXT_MODEL = 'claude-haiku-4-5-20251001';
const VISION_MODEL = 'claude-sonnet-4-6';

// Дэлгүүрийн мэдээллийг system prompt болгон бэлдэх
async function shopContext() {
  // Агуулахад одоо байгаа цэцгүүд (5 мин кэштэй тул хурдан)
  let flowerBlock = '';
  try {
    const flowers = await getFlowerTypes();
    const inStock = flowers.filter(f => f.stock > 0).map(f => f.name);
    if (inStock.length) {
      flowerBlock = `Одоо байгаа цэцгийн төрлүүд: ${inStock.join(', ')}\n`;
    }
  } catch (err) {
    console.error('AI чат цэцэг унших алдаа:', err.message);
  }

  // Үнэ харуулах горимд л үнийн жагсаалтыг оруулна
  const priceBlock = SHOW_PRICES
    ? `Үнийн жагсаалт:\n${Object.values(CATALOG)
        .map(v => `- ${v.label}: ${v.unitPrice.toLocaleString()}₮`)
        .join('\n')}\n`
    : `Үнэ: Одоогоор үнийн мэдээллийг чатад зарлаагүй байгаа. Үнэ асуувал "ажилтан тань нарийн үнийг баталгаажуулна" гэж эелдэг хэлээрэй. Хэзээ ч тодорхой тоо хэлж болохгүй.\n`;

  const priceRule = SHOW_PRICES
    ? '- Үнэ, хүргэлт, баглааны талаар асуухад дээрх мэдээллээр хариул.'
    : '- Үнийн талаар асуувал тодорхой тоо бүү хэл; "ажилтан тань үнийг хэлнэ" гэж чиглүүл.';

  return `Чи бол "La Paradiso" цэцгийн дэлгүүрийн туслах бот. Үйлчлүүлэгчтэй монголоор, эелдэг, товч (1-3 өгүүлбэр) ярь.

${flowerBlock}${priceBlock}
📍 Хаяг: ${SHOP_INFO.address}
🕙 Цагийн хуваарь: ${SHOP_INFO.hours}
🚚 Хүргэлт: ${SHOP_INFO.delivery}
🗺️ Байршил: ${SHOP_INFO.maps}

Төлбөр: ${PAYMENT_INFO}
Баглааны зургийн цомог: ${BOUQUET_ALBUM_URL}

Дүрэм:
${priceRule}
- Хаяг, цаг, хүргэлт, байршлын талаар асуувал дээрх мэдээллээр хариул.
- Баглааны загвар үзэхийг хүсвэл цомгийн линкийг өг.
- Захиалга өгөхийг хүсвэл "захиалга" гэж бичихийг санал болго.
- Зөвхөн цэцэг / дэлгүүртэй холбоотой асуултад хариул.`;
}

// Текст асуултад хариулах (богино түүхтэй)
export async function askAI(history, userText) {
  const res = await anthropic.messages.create({
    model: TEXT_MODEL,
    max_tokens: 500,
    system: await shopContext(),
    messages: [...history, { role: 'user', content: userText }],
  });
  return res.content[0].text.trim();
}

// Зургаас барагцаа үнэ хэлэх
export async function priceFromImage(imageUrl) {
  const resp = await fetch(imageUrl);
  const buffer = await resp.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mediaType = resp.headers.get('content-type')?.split(';')[0] || 'image/jpeg';

  // Үнэ харуулах горимд барагцаа үнэ хэлнэ, эс бөгөөс зөвхөн төрлийг тодорхойлно
  const prompt = SHOW_PRICES
    ? 'Энэ зураг дээрх цэцэг / баглааг хараад манай үнийн жагсаалттай ойролцоо барагцаа үнийг хэлээрэй. Яг тохирохгүй бол хамгийн ойрын төрлийг сонго. Хариултын төгсгөлд "Нарийн үнийг ажилтан баталгаажуулна" гэж нэм.'
    : 'Энэ зураг дээрх цэцэг / баглааг хараад ямар төрлийн цэцэг/баглаа болохыг эелдэгээр тайлбарла. Үнийн тодорхой тоо БҮҮ хэл. Хариултын төгсгөлд "Нарийн үнийг ажилтан тань баталгаажуулна" гэж нэм.';

  const res = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 500,
    system: await shopContext(),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return res.content[0].text.trim();
}
