// Facebook Messenger руу мессеж илгээх функцууд
const FB_API = 'https://graph.facebook.com/v21.0/me/messages';
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// Ботын өөрөө илгээсэн мессежийн ID-г түр санана. Echo ирэхэд энд байвал
// "бот өөрөө", байхгүй бол "ажилтан гараар бичсэн" гэж найдвартай ялгана.
// (app_id-аар ялгах нь Business Suite дээр ажиллахгүй байсан.)
const botSentMids = new Set();
const MAX_MIDS = 1000;

export function wasSentByBot(mid) {
  return !!mid && botSentMids.has(mid);
}

async function callSendAPI(payload) {
  const res = await fetch(`${FB_API}?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error('FB send error:', body);
    return res;
  }

  try {
    const mid = JSON.parse(body)?.message_id;
    if (mid) {
      botSentMids.add(mid);
      // Хэт олон хуримтлагдахаас сэргийлж хамгийн эртнийг нь хасна
      if (botSentMids.size > MAX_MIDS) {
        const it = botSentMids.values();
        for (let i = 0; i < 200; i++) botSentMids.delete(it.next().value);
      }
    }
  } catch { /* JSON биш хариу — алгасна */ }

  return res;
}

// Энгийн текст мессеж
export async function sendText(psid, text) {
  await callSendAPI({
    recipient: { id: psid },
    message: { text },
  });
}

// Товчтой мессеж (quick replies — нэг удаагийн товч)
export async function sendButtons(psid, text, buttons) {
  await callSendAPI({
    recipient: { id: psid },
    message: {
      text,
      quick_replies: buttons.map(b => ({
        content_type: 'text',
        title: b.title,
        payload: b.payload,
      })),
    },
  });
}

// URL товчтой мессеж (web_url — даравал линк/газрын зураг нээнэ).
// Instagram button template дэмждэггүй тул бүтэхгүй бол энгийн текстээр илгээнэ.
export async function sendLinkButton(psid, text, links) {
  const res = await callSendAPI({
    recipient: { id: psid },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text,
          buttons: links.slice(0, 3).map(l => ({
            type: 'web_url',
            url: l.url,
            title: l.title,
          })),
        },
      },
    },
  });
  if (res && !res.ok) {
    await sendText(psid, `${text}\n${links.map(l => `${l.title}: ${l.url}`).join('\n')}`);
  }
}

// Хэрэглэгч бичиж байгаа дохио
export async function sendTyping(psid) {
  await callSendAPI({
    recipient: { id: psid },
    sender_action: 'typing_on',
  });
}

