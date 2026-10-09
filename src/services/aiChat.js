// AI чат — үйлчлүүлэгчийн чөлөөт асуултад Claude-аар хариулах
import Anthropic from '@anthropic-ai/sdk';
import { CATALOG, PAYMENT_INFO, BOUQUET_ALBUM_URL, SHOW_PRICES, SHOP_INFO } from '../config/catalog.js';
import { getFlowerTypes } from './sheets.js';
import { sniffType } from './vision.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Сайтын бэлэн загварууд (public/catalog.json) — сайтын туслах тэдгээрийг санал болгоно
let readyCache = null;
function readyBouquets() {
  if (!readyCache) {
    try {
      const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'catalog.json');
      readyCache = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { readyCache = []; }
  }
  return readyCache;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Текст асуултад — хямд, хурдан загвар. Зураг танихад — vision загвар.
const TEXT_MODEL = 'claude-haiku-4-5-20251001';
const VISION_MODEL = 'claude-sonnet-4-6';

// Дэлгүүрийн мэдээллийг system prompt болгон бэлдэх
async function shopContext({ web = false } = {}) {
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

  const channelBlock = web
    ? `Чи одоо дэлгүүрийн ВЭБ САЙТ дээр хариулж байна. Сайтын хуудсууд:
- /zagvar — бэлэн баглаанууд, сонгоод шууд захиална
- /baglaa — пиксел цэцгээр баглаагаа өөрөө угсарч захиална
- /test — "Та ямар цэцэг вэ?" тест
- /trivia — цэцгийн асуулт хариултын тоглоом

Бэлэн баглаанууд (дугаар, нэр):
${readyBouquets().map(b => `${b.id} ${b.name}`).join('; ')}
`
    : `Баглааны зургийн цомог: ${BOUQUET_ALBUM_URL}\n`;

  const channelRules = web
    ? `- Захиалах гэвэл /zagvar эсвэл /baglaa хуудсыг санал болго. Чи өөрөө захиалга авч чадахгүй.
- Тодорхой баглаа санал болгохдоо холбоосыг нь яг ингэж бич: /zagvar#b20 (дугаар нь жагсаалтаас).
  Жагсаалтад байхгүй баглаа, дугаар бүү зохио. Нэг хариултад хамгийн ихдээ 2 баглаа санал болго.
- Юу авахаа мэдэхгүй байвал хэнд, ямар тохиолдлоор гэдгийг нэг асуугаад дараа нь санал болго.`
    : `- Баглааны загвар үзэхийг хүсвэл цомгийн линкийг өг.
- Захиалга өгөхийг хүсвэл "захиалга" гэж бичихийг санал болго.`;

  return `Чи бол "La Paradiso" цэцгийн дэлгүүрийн туслах бот. Үйлчлүүлэгчтэй монголоор, эелдэг, товч (1-3 өгүүлбэр) ярь.

${flowerBlock}${priceBlock}
📍 Хаяг: ${SHOP_INFO.address}
🕙 Цагийн хуваарь: ${SHOP_INFO.hours}
🚚 Хүргэлт: ${SHOP_INFO.delivery}
🗺️ Байршил: ${SHOP_INFO.maps}

${web ? '' : `Төлбөр: ${PAYMENT_INFO}\n`}${channelBlock}
Дүрэм:
${priceRule}
- Хаяг, цаг, хүргэлт, байршлын талаар асуувал дээрх мэдээллээр хариул.
${channelRules}
- Зөвхөн цэцэг / дэлгүүртэй холбоотой асуултад хариул.
- Markdown (##, **, *, -, жагсаалт) ОГТ бүү ашигла — Messenger энгийн текст л харуулдаг. Emoji ашиглаж болно.
- Хариулт богино байг: 1-3 өгүүлбэр, зураг тайлбарлахад ч мөн адил.

ХЭЛНИЙ ЧАНД ДҮРЭМ:
- Үйлчлүүлэгчийг ДАНДАА "Та" гэж хүндэтгэлээр дууд. "чи", "чамд", "чамайг", "чиний", "танилцуулна уу" гэх мэт
  дотно/тушаах хэлбэрийг ХЭЗЭЭ Ч бүү ашигла. Үйл үгээ "-на уу / -нэ үү", "байна" хэлбэрээр төгсгө.
- Энгийн, байгалийн монгол хэлээр бич. Зохиомол, орчуулга шиг хэллэг бүү зохио.
  ЖИШЭЭ БУРУУ: "дэлгүүр рүү ирсэнд сайн морилно", "Тогтоол", "сайн морилно уу".
  ЖИШЭЭ ЗӨВ: "Сайн байна уу!", "Баярлалаа", "Мэдээж болно".
- Мэндчилгээг зөвхөн яриа эхлэхэд нэг удаа хэл, дараа нь давтахгүй.
- Мэдэхгүй зүйлээ бүү зохио — "ажилтан маань тодруулж хэлнэ" гэж хариул.`;
}

// Текст асуултад хариулах (богино түүхтэй)
export async function askAI(history, userText, opts = {}) {
  const res = await anthropic.messages.create({
    model: TEXT_MODEL,
    max_tokens: 500,
    system: await shopContext(opts),
    messages: [...history, { role: 'user', content: userText }],
  });
  return res.content[0].text.trim();
}

// Зургаас барагцаа үнэ хэлэх
export async function priceFromImage(imageUrl) {
  const resp = await fetch(imageUrl);
  const buf = Buffer.from(await resp.arrayBuffer());
  const base64 = buf.toString('base64');
  // Толгойн мэдээлэл буруу байж болох тул файлын жинхэнэ төрлийг байтаас нь таана
  const mediaType = sniffType(buf) || resp.headers.get('content-type')?.split(';')[0] || 'image/jpeg';

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
