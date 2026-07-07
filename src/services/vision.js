// Claude Vision — зураг/PDF-ээс бараа таталтын мэдээлэл унших
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Энэ бол цэцгийн дэлгүүрийн бараа нийлүүлэлтийн баримт бичиг.
Баримтаас дараах мэдээллийг JSON форматаар гарга:
{
  "barimtNo": "баримтын дугаар",
  "ogno": "огноо (YYYY-MM-DD)",
  "nilluulegch": "нийлүүлэгчийн нэр",
  "niitDun": нийт дүн (тоо),
  "baraa": [
    { "ner": "бараа нэр", "too": тоо, "negj": нэгж үнэ, "niit": нийт дүн },
    ...
  ]
}
Зөвхөн JSON буцаа, өөр текст хэрэггүй.`;

export async function readInvoice(attachment) {
  const { url, contentType } = attachment;

  // Файл татах
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  let message;

  if (contentType?.includes('pdf')) {
    // PDF
    message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } else {
    // Зураг
    const mediaType = contentType || 'image/jpeg';
    message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  }

  // Хариу max_tokens-д тайрагдсан бол JSON дутуу тул ойлгомжтой алдаа өгнө
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Баримт хэт урт — хариу тайрагдлаа. Баримтыг хэсэгчилж явуулна уу.');
  }

  const text = message.content[0].text.trim();
  // JSON цэвэрлэх — ``` хүрээ арилгаад эхний { -ээс сүүлийн } хүртэлх хэсгийг авна
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    console.error('Vision хариу JSON биш:', cleaned.slice(0, 300));
    throw new Error('Баримтаас мэдээлэл гаргаж чадсангүй. Илүү тод зураг явуулна уу.');
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    console.error('Vision JSON parse алдаа. Хариу:', cleaned.slice(0, 300));
    throw new Error('Баримтын мэдээлэл задлахад алдаа гарлаа. Дахин оролдоно уу.');
  }
}
