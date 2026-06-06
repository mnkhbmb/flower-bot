// AI чат — үйлчлүүлэгчийн чөлөөт асуултад Claude-аар хариулах
import Anthropic from '@anthropic-ai/sdk';
import { CATALOG, PAYMENT_INFO, BOUQUET_ALBUM_URL } from '../config/catalog.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Текст асуултад — хямд, хурдан загвар. Зураг танихад — vision загвар.
const TEXT_MODEL = 'claude-haiku-4-5-20251001';
const VISION_MODEL = 'claude-sonnet-4-6';

// Дэлгүүрийн мэдээллийг system prompt болгон бэлдэх
function shopContext() {
  const priceList = Object.values(CATALOG)
    .map(v => `- ${v.label}: ${v.unitPrice.toLocaleString()}₮`)
    .join('\n');
  return `Чи бол "La Paradiso" цэцгийн дэлгүүрийн туслах бот. Үйлчлүүлэгчтэй монголоор, эелдэг, товч (1-3 өгүүлбэр) ярь.

Үнийн жагсаалт:
${priceList}

Төлбөр: ${PAYMENT_INFO}
Баглааны зургийн цомог: ${BOUQUET_ALBUM_URL}

Дүрэм:
- Үнэ, хүргэлт, баглааны талаар асуухад дээрх мэдээллээр хариул.
- Баглааны загвар үзэхийг хүсвэл цомгийн линкийг өг.
- Үнэ тодорхойгүй эсвэл тусгай захиалгад "ажилтан тань нарийн үнийг хэлнэ" гэж хэл.
- Захиалга өгөхийг хүсвэл "захиалга" гэж бичихийг санал болго.
- Зөвхөн цэцэг / дэлгүүртэй холбоотой асуултад хариул.`;
}

// Текст асуултад хариулах (богино түүхтэй)
export async function askAI(history, userText) {
  const res = await anthropic.messages.create({
    model: TEXT_MODEL,
    max_tokens: 500,
    system: shopContext(),
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

  const res = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 500,
    system: shopContext(),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Энэ зураг дээрх цэцэг / баглааг хараад манай үнийн жагсаалттай ойролцоо барагцаа үнийг хэлээрэй. Яг тохирохгүй бол хамгийн ойрын төрлийг сонго. Хариултын төгсгөлд "Нарийн үнийг ажилтан баталгаажуулна" гэж нэм.' },
      ],
    }],
  });
  return res.content[0].text.trim();
}
