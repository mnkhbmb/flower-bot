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

// Текст асуултад — монгол хэлийг зөв бичдэг загвар (жижиг загвар үг зохиож, алдаатай бичдэг байсан).
// Railway дээр AI_CHAT_MODEL-оор сольж болно. Зураг танихад — vision загвар.
const TEXT_MODEL = process.env.AI_CHAT_MODEL || 'claude-sonnet-5-5';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const VISION_MODEL = 'claude-sonnet-4-6';

// Улаанбаатарын одоогийн огноо, цаг ("өнөөдөр нээлттэй юу" гэх мэт асуултад)
function ubNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const days = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  return `${d.toISOString().slice(0, 10)} (${days[d.getUTCDay()]}), ${d.toISOString().slice(11, 16)}`;
}

// Дэлгүүрийн мэдээллийг system prompt болгон бэлдэх.
// Заавар нь англиар (загвар нарийн дагадаг), баримт ба жишээ өгүүлбэрүүд монголоор.
async function shopContext({ web = false } = {}) {
  // Агуулахад одоо байгаа цэцгүүд (5 мин кэштэй тул хурдан)
  let stock = '';
  try {
    const flowers = await getFlowerTypes();
    const inStock = flowers.filter(f => f.stock > 0).map(f => f.name);
    if (inStock.length) stock = inStock.join(', ');
  } catch (err) {
    console.error('AI чат цэцэг унших алдаа:', err.message);
  }

  const prices = SHOW_PRICES
    ? `Price list:\n${Object.values(CATALOG).map(v => `- ${v.label}: ${v.unitPrice.toLocaleString()}₮`).join('\n')}`
    : `Prices: NOT published. Never state or estimate any amount in tugrik. If asked about price, say in one sentence that staff will confirm it, e.g. "Үнийг ажилтан маань баталгаажуулж хэлнэ."`;

  const channel = web
    ? `CHANNEL: the shop's WEBSITE chat widget. You cannot take orders, and nobody will phone the customer because of this chat.
Site pages:
- /zagvar : ready-made bouquets; the customer picks one and orders it there
- /baglaa : build your own bouquet from pixel flowers and order it
- /test : "Та ямар цэцэг вэ?" personality test
- /trivia : flower quiz game
After an order is placed on the site, staff contact the customer to confirm the price and details.
To reach a human: https://m.me/LaParadisoMN

Ready-made bouquets (code | name | what is in it):
${readyBouquets().map(b => `${b.id} | ${b.name} | ${b.desc}`).join('\n')}

Recommending bouquets:
- Recommend only from the list above, choosing by the flowers and colours in the description. At most 2 per reply.
- Name the bouquet in «» and put its link alone on the next line, exactly like: /zagvar#b20
  The widget turns that line into a picture card, so never write the code (b20) anywhere else and never describe the link.
- If nothing in the list fits, say so and point to /zagvar or /baglaa instead of inventing one.
- If the customer has not said who it is for or the occasion and it matters, ask ONE short question first. If they already said (e.g. "ээждээ"), recommend straight away.
- How to order: one or two sentences pointing to /zagvar (ready-made) or /baglaa (build your own).`
    : `CHANNEL: Facebook Messenger.
Payment: ${PAYMENT_INFO}
Photo album of bouquets: ${BOUQUET_ALBUM_URL}
- If the customer wants to see bouquet designs, give the album link.
- If the customer wants to order, tell them to write "захиалга".`;

  return `You are the chat assistant of "La Paradiso", a flower shop in Ulaanbaatar. You answer customers in Mongolian.

FACTS (the only things you know about the shop):
Now in Ulaanbaatar: ${ubNow()}
Address: ${SHOP_INFO.address}
Opening hours: ${SHOP_INFO.hours}
Delivery: ${SHOP_INFO.delivery}
Map: ${SHOP_INFO.maps}
${stock ? `Flower types in stock now (names only; colours and quantities are NOT known): ${stock}` : 'Flower stock: unknown right now.'}
${prices}

${channel}

HOW TO ANSWER:
- Answer the question that was asked, first, in 1-3 short sentences. No preamble, no praise of the question.
- Use only the FACTS above. Anything else (which districts are in the delivery zone, delivery fee, colours in stock, pick-up outside opening hours, custom requests, discounts) you do not know: say staff will confirm, e.g. "Үүнийг ажилтан маань тодруулж хэлнэ."${web ? ' and give the Messenger link.' : ''} Never guess.
- Do not end every reply with a question. Ask at most one question, and only when you need the answer to help.
- Greet with "Сайн байна уу!" only when the customer's message is itself a greeting and it is the start of the conversation. Otherwise do not greet.
- Only flowers and this shop. For anything else, decline politely in one sentence.
- Plain text only: no markdown, no asterisks, no headings, no bullet lists. At most one emoji per reply, and none is fine.

MONGOLIAN LANGUAGE (very important, customers notice mistakes):
- Write in Cyrillic Mongolian, standard spelling. Customers often type Mongolian in Latin letters ("hurgelt hiideg uu", "zaisand", "margaash"); read it as Mongolian and still reply in Cyrillic.
- Always address the customer respectfully as "та" (танд, таны, танаас). Never "чи / чамд / чиний". Polite verb forms: "-на уу / -нэ үү", "-аарай / -ээрэй".
- Use everyday shop language, the way a friendly florist in Ulaanbaatar would text. Short simple sentences. Never invent words or translate English idioms word for word. If you are not sure a word exists, use a simpler one.
- Spell correctly: "Тийм ээ" (not "тиймээ"), "Тэгье", "Тэгээрэй", "баярлалаа", "уучлаарай", "үзээрэй", "захиалаарай", "бүсгүйчүүд", "цэцгийн".
- Good examples of tone:
  "Тийм ээ, хүргэлт хийдэг. 50,000₮-аас дээш захиалгыг хотын А бүсэд хүргэнэ."
  "Манай дэлгүүр өдөр бүр 10:00-20:00 цагт ажилладаг."
  "Их Найд Plaza-гийн 1 давхарт байрладаг."
  "Ээждээ бол «Цагаан сараана» сайхан тохирно."
  "Хэнд, ямар тохиолдлоор бэлэглэх вэ?"
  "Үнийг ажилтан маань баталгаажуулж хэлнэ."
- Never write phrases like: "сайн морилно", "тавтай морилно уу", "асуулт сайн байна", "сонирхож үзнэ үү", "мэдээч".`;
}

// Загварын хариултаас markdown-ийн үлдэгдлийг арилгана. Сайтад: жагсаалтад байхгүй баглааны
// дугаар бичсэн бол холбоосыг каталог руу чиглүүлнэ.
function tidy(text, web) {
  let t = text.replace(/\*\*|__/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (web) {
    const ids = new Set(readyBouquets().map(b => b.id));
    t = t.replace(/\/zagvar#(b\d{2})/g, (m, id) => (ids.has(id) ? m : '/zagvar'));
  }
  return t;
}

// Текст асуултад хариулах (богино түүхтэй)
export async function askAI(history, userText, opts = {}) {
  const req = {
    max_tokens: 500,
    system: await shopContext(opts),
    messages: [...history, { role: 'user', content: userText }],
  };
  let res;
  try {
    res = await anthropic.messages.create({ model: TEXT_MODEL, ...req });
  } catch (err) {
    // Загварын нэр буруу / хаагдсан бол чат бүрмөсөн унахгүйн тулд хуучин загвараар хариулна
    if (TEXT_MODEL === FALLBACK_MODEL || ![400, 404].includes(err.status)) throw err;
    console.error(`AI загвар ${TEXT_MODEL} ажилласангүй (${err.message}), ${FALLBACK_MODEL} ашиглалаа`);
    res = await anthropic.messages.create({ model: FALLBACK_MODEL, ...req });
  }
  const text = res.content.find(c => c.type === 'text')?.text || '';
  if (!text.trim()) throw new Error('AI хоосон хариу өглөө');
  return tidy(text, opts.web);
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
