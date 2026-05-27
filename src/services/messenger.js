// Facebook Messenger руу мессеж илгээх функцууд
const FB_API = 'https://graph.facebook.com/v21.0/me/messages';
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

async function callSendAPI(payload) {
  const res = await fetch(`${FB_API}?access_token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('FB send error:', await res.text());
  }
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

// Хэрэглэгч бичиж байгаа дохио
export async function sendTyping(psid) {
  await callSendAPI({
    recipient: { id: psid },
    sender_action: 'typing_on',
  });
}
