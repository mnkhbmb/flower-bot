// Захиалгын яриа удирдах — товч дарж сонгох flow
import { sendText, sendButtons, sendTyping } from '../services/messenger.js';
import { addOrder } from '../services/sheets.js';
import { notifyNewOrder } from '../services/discord.js';
import { CATALOG, STEPS, PAYMENT_INFO } from '../config/catalog.js';

// Хэрэглэгч бүрийн ярианы төлөв (санах ой). Production-д Redis/DB зөвлөнө.
const sessions = new Map();

function getSession(psid) {
  if (!sessions.has(psid)) {
    sessions.set(psid, { step: STEPS.START, order: {} });
  }
  return sessions.get(psid);
}

// Бүх ирсэн мессежийг энд чиглүүлнэ
export async function handleMessage(psid, message) {
  const session = getSession(psid);
  await sendTyping(psid);

  const payload = message.quick_reply?.payload;
  const text = message.text?.trim();

  // Эхлэл / "захиалга" гэж бичсэн
  if (session.step === STEPS.START || payload === 'START_ORDER') {
    return askFlower(psid, session);
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

    case STEPS.PICK_QTY:
      if (payload?.startsWith('QTY_')) {
        session.order.qty = Number(payload.replace('QTY_', ''));
        return askDelivery(psid, session);
      }
      if (text && !isNaN(Number(text))) {
        session.order.qty = Number(text);
        return askDelivery(psid, session);
      }
      break;

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
      session.order.name = text;
      return askPhone(psid, session);

    case STEPS.ASK_PHONE:
      session.order.phone = text;
      if (session.order.delivery) return askAddress(psid, session);
      return showConfirm(psid, session);

    case STEPS.ASK_ADDRESS:
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
