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
  "valyut": "CNY" эсвэл "MNT",
  "baraa": [
    { "ner": "бараа нэр", "too": тоо, "negj": нэгж үнэ, "niit": нийт дүн },
    ...
  ]
}
"valyut": баримтын үнэ ямар мөнгөн тэмдэгтээр байгааг заа. ¥, 元, RMB, CNY тэмдэг байвал
эсвэл баримт хятад хэл дээр байвал "CNY". ₮, MNT, төгрөг гэж байвал "MNT".
Тоонуудыг баримт дээр бичсэнээр нь, хөрвүүлэлгүй буцаа.
Хэд хэдэн зураг/хуудас ирвэл тэдгээр нь НЭГ баримтын үргэлжлэл. Бүх хуудасны барааг нэг "baraa"
жагсаалтад дарааллаар нь нэгтгэж, "niitDun"-д бүх хуудасны нийлбэрийг бич.
Зөвхөн JSON буцаа, өөр текст хэрэггүй.`;

// Файлын эхний байтуудаас жинхэнэ төрлийг нь таана. Discord-ын мэдээлсэн төрөл заримдаа
// буруу байдаг (PNG-г JPEG гэх мэт) бөгөөд API тэр зөрүүг хүлээж авдаггүй.
export function sniffType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Нэг баримтын нэг буюу хэд хэдэн хуудсыг (зураг/PDF) хамтад нь уншина
export async function readInvoice(attachments) {
  const list = (Array.isArray(attachments) ? attachments : [attachments]).slice(0, 10);

  const content = [];
  for (const att of list) {
    const res = await fetch(att.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = sniffType(buf);
    if (!type) continue;                       // зураг, PDF биш файлыг алгасна
    const data = buf.toString('base64');
    content.push(type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: type, data } }
      : { type: 'image', source: { type: 'base64', media_type: type, data } });
  }
  if (!content.length) throw new Error('Уншиж болох зураг эсвэл PDF олдсонгүй.');
  content.push({ type: 'text', text: PROMPT });

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 16000,                         // олон хуудастай баримтад хүрэлцэхээр
    messages: [{ role: 'user', content }],
  });

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
