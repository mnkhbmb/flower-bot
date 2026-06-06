// Захиалгын яриа удирдах — товч дарж сонгох flow
import { sendText, sendButtons, sendTyping } from '../services/messenger.js';
import { addOrder } from '../services/sheets.js';
import { notifyNewOrder } from '../services/discord.js';
import { askAI, priceFromImage } from '../services/aiChat.js';
import { CATALOG, STEPS, PAYMENT_INFO, BOUQUET_ALBUM_URL } from '../config/catalog.js';

// Хэрэглэгч бүрийн ярианы төлөв (санах ой). Production-д Redis/DB зөвлөнө.
const sessions = new Map();

function getSession(psid) {
  if (!sessions.has(psid)) {
    sessions.set(psid, { step: STEPS.START, order: {} });
  }
  return sessions.get(psid);
}

// Утасны дугаар шалгах — цэг/зай/зураас зайлуулаад 8 оронтой эсэхийг шалгана
function normalizePhone(text) {
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

// Бүх ирсэн мессежийг энд чиглүүлнэ
export async function handleMessage(psid, message) {
  const session = getSession(psid);
  await sendTyping(psid);

  const payload = message.quick_reply?.payload;
  const text = message.text?.trim();
  const imageUrl = message.attachments?.find(a => a.type === 'image')?.payload?.url;

  // Захиалга эхлүүлэх товч — хаанаас ч ажиллана (AI горимоос гарах ч мөн)
  if (payload === 'START_ORDER') {
    return askFlower(psid, session);
  }

  // AI чат руу орох товч
  if (payload === 'AI_CHAT') {
    return enterAiChat(psid, session);
  }

  // Баглааны цомог үзэх товч
  if (payload === 'VIEW_ALBUM') {
    await sendText(psid, `Манай баглааны загварууд энд байна 📸\n${BOUQUET_ALBUM_URL}`);
    return showMenu(psid, session);
  }

  // Зураг ирвэл — хаанаас ч барагцаа үнэ хэлж AI горимд оруулна
  if (imageUrl) {
    return handleImage(psid, session, imageUrl);
  }

  // AI чат горим
  if (session.step === STEPS.AI_CHAT) {
    return handleAiChat(psid, session, text);
  }

  // Эхлэл — цэс харуулна
  if (session.step === STEPS.START) {
    return showMenu(psid, session);
  }

  switch (session.step) {
    case STEPS.PICK_FLOWER:
      if (payload?.startsWith('FLOWER_')) {
        const key = payload.replace('FLOWER_', '');
        session.order.flowerKey = key;
        session.order.flower = CATALOG[key].label;
        session.order.unitPrice = CATALOG[key].unitPrice;
        return askQty(psid, session);
      }
      break;

    case STEPS.PICK_QTY: {
      let qty;
      if (payload?.startsWith('QTY_')) {
        qty = Number(payload.replace('QTY_', ''));
      } else if (text && !isNaN(Number(text))) {
        qty = Number(text);
      }
      if (qty !== undefined) {
        if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
          await sendText(psid, 'Тоо ширхэг 1-ээс 100 хооронд бүхэл тоо байх ёстой. Дахин оруулна уу 🌸');
          return;
        }
        session.order.qty = qty;
        return askDelivery(psid, session);
      }
      break;
    }

    case STEPS.PICK_DELIVERY:
      if (payload === 'DELIVERY_YES') {
        session.order.delivery = true;
        return askName(psid, session);
      }
      if (payload === 'DELIVERY_NO') {
        session.order.delivery = false;
        return askName(psid, session);
      }
      break;

    case STEPS.ASK_NAME:
      if (!text) {
        await sendText(psid, 'Нэрээ бичиж илгээнэ үү 🌸');
        return;
      }
      session.order.name = text;
      return askPhone(psid, session);

    case STEPS.ASK_PHONE: {
      const phone = normalizePhone(text);
      if (!phone) {
        await sendText(psid, 'Утасны дугаар 8 оронтой байх ёстой. Жишээ: 99112233 📞');
        return;
      }
      session.order.phone = phone;
      if (session.order.delivery) return askAddress(psid, session);
      return showConfirm(psid, session);
    }

    case STEPS.ASK_ADDRESS:
      if (!text) {
        await sendText(psid, 'Хүргэх хаягаа бичиж илгээнэ үү 📍');
        return;
      }
      session.order.address = text;
      return showConfirm(psid, session);

    case STEPS.CONFIRM:
      if (payload === 'CONFIRM_YES') return finishOrder(psid, session);
      if (payload === 'CONFIRM_NO') {
        sessions.delete(psid);
        await sendText(psid, 'Захиалга цуцлагдлаа. Дахин эхлэхийг хүсвэл "захиалга" гэж бичнэ үү 🌸');
        return;
      }
      break;
  }

  // Ойлгомжгүй мессежид
  await sendText(psid, 'Уучлаарай, ойлгосонгүй. Доорх товчийг дарна уу 🌸');
}

// ===== ЦЭС БА AI ЧАТ =====

// Эхний цэс — захиалга / асуулт / баглаа
async function showMenu(psid, session) {
  session.step = STEPS.START;
  await sendButtons(
    psid,
    'Сайн байна уу! La Paradiso цэцгийн дэлгүүрт тавтай морил 🌸\nЮу хийх вэ?',
    [
      { title: '🌸 Захиалга өгөх', payload: 'START_ORDER' },
      { title: '💬 Асуулт асуух', payload: 'AI_CHAT' },
      { title: '📸 Баглаа үзэх', payload: 'VIEW_ALBUM' },
    ]
  );
}

// AI чат горимд орох
async function enterAiChat(psid, session) {
  session.step = STEPS.AI_CHAT;
  session.aiHistory = [];
  await sendButtons(
    psid,
    'Юу асуух вэ? Үнэ, хүргэлт, баглааны талаар хариулъя 💬\n\nЗахиалга өгөхийг хүсвэл "захиалга" гэж бичээрэй.',
    [{ title: '🌸 Захиалга өгөх', payload: 'START_ORDER' }]
  );
}

// AI горим дахь текст асуултыг боловсруулах
async function handleAiChat(psid, session, text) {
  if (/захиалга/i.test(text || '')) return askFlower(psid, session);
  if (!text) {
    await sendText(psid, 'Асуултаа бичиж илгээнэ үү 💬');
    return;
  }
  session.aiHistory = session.aiHistory || [];
  try {
    const reply = await askAI(session.aiHistory.slice(-8), text);
    session.aiHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    if (session.aiHistory.length > 16) session.aiHistory = session.aiHistory.slice(-16);
    await sendButtons(psid, reply, [{ title: '🌸 Захиалга өгөх', payload: 'START_ORDER' }]);
  } catch (err) {
    console.error('AI chat error:', err.message);
    await sendText(psid, 'Уучлаарай, одоо хариулж чадсангүй. Захиалга өгөх бол "захиалга" гэж бичнэ үү 🌸');
  }
}

// Ирсэн зургийг барагцаа үнээр хариулах
async function handleImage(psid, session, imageUrl) {
  session.step = STEPS.AI_CHAT;
  session.aiHistory = session.aiHistory || [];
  try {
    const reply = await priceFromImage(imageUrl);
    session.aiHistory.push({ role: 'user', content: '[зураг илгээв]' }, { role: 'assistant', content: reply });
    await sendButtons(psid, reply, [{ title: '🌸 Захиалга өгөх', payload: 'START_ORDER' }]);
  } catch (err) {
    console.error('Image price error:', err.message);
    await sendText(psid, 'Зургийг уншиж чадсангүй. Ажилтан тань тун удахгүй хариулна 🌸');
  }
}

// ===== АЛХАМ БҮР =====

async function askFlower(psid, session) {
  session.step = STEPS.PICK_FLOWER;
  session.order = {};
  await sendButtons(
    psid,
    'Сайн байна уу! Манай цэцгийн дэлгүүрт тавтай морил 🌸\nЯмар цэцэг сонгох вэ?',
    Object.entries(CATALOG).map(([key, v]) => ({
      title: v.label,
      payload: `FLOWER_${key}`,
    }))
  );
}

async function askQty(psid, session) {
  session.step = STEPS.PICK_QTY;
  await sendButtons(
    psid,
    `${session.order.flower} сонголоо.\nХэдэн ширхэг / баглаа авах вэ?`,
    [1, 5, 10, 25, 50].map(n => ({ title: String(n), payload: `QTY_${n}` }))
  );
}

async function askDelivery(psid, session) {
  session.step = STEPS.PICK_DELIVERY;
  await sendButtons(psid, 'Хүргэлт хэрэгтэй юу?', [
    { title: '🚚 Тийм, хүргүүлнэ', payload: 'DELIVERY_YES' },
    { title: '🏬 Үгүй, очиж авна', payload: 'DELIVERY_NO' },
  ]);
}

async function askName(psid, session) {
  session.step = STEPS.ASK_NAME;
  await sendText(psid, 'Нэрээ бичнэ үү:');
}

async function askPhone(psid, session) {
  session.step = STEPS.ASK_PHONE;
  await sendText(psid, 'Утасны дугаараа бичнэ үү:');
}

async function askAddress(psid, session) {
  session.step = STEPS.ASK_ADDRESS;
  await sendText(psid, 'Хүргэх хаягаа бичнэ үү:');
}

async function showConfirm(psid, session) {
  session.step = STEPS.CONFIRM;
  const o = session.order;
  const total = (o.qty * o.unitPrice).toLocaleString();
  let summary = `Танай захиалга:\n🌸 ${o.flower} x ${o.qty}\n💰 Нийт: ${total}₮\n`;
  summary += o.delivery ? `🚚 Хүргэлт: ${o.address}\n` : '🏬 Дэлгүүрээс авна\n';
  summary += `📞 ${o.phone}\n\nЗөв үү?`;
  await sendButtons(psid, summary, [
    { title: '✅ Баталгаажуулах', payload: 'CONFIRM_YES' },
    { title: '✏️ Цуцлах', payload: 'CONFIRM_NO' },
  ]);
}

async function finishOrder(psid, session) {
  try {
    const saved = await addOrder(session.order);   // Sheets руу бичих
    await notifyNewOrder(saved);                    // Discord руу мэдэгдэх
    await sendText(
      psid,
      `Баярлалаа! Захиалга ${saved.orderId} хүлээн авлаа 🌸\n` +
      `Төлбөрийн мэдээлэл:\n${PAYMENT_INFO}\n\nБид удахгүй холбогдоно.`
    );
  } catch (err) {
    console.error('Order save error:', err);
    await sendText(psid, 'Захиалга хадгалахад алдаа гарлаа. Дахин оролдоно уу 🙏');
  }
  sessions.delete(psid);
}
