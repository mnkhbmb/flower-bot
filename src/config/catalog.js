// Цэцэг, үнийн каталог — энд засаж шинэчилнэ
export const CATALOG = {
  rose:  { label: '🌹 Сарнай',          unitPrice: 3000  },
  lily:  { label: '🌷 Лили',            unitPrice: 5000  },
  mixed: { label: '💐 Холимог баглаа',  unitPrice: 40000 },
  gift:  { label: '🎀 Бэлэг баглаа',    unitPrice: 55000 },
};

// Захиалгын flow-ийн алхмууд (state machine)
export const STEPS = {
  START: 'start',
  PICK_FLOWER: 'pick_flower',
  PICK_QTY: 'pick_qty',
  PICK_DELIVERY: 'pick_delivery',
  ASK_NAME: 'ask_name',
  ASK_PHONE: 'ask_phone',
  ASK_ADDRESS: 'ask_address',
  CONFIRM: 'confirm',
  AI_CHAT: 'ai_chat',
  DONE: 'done',
};

// Дансны мэдээлэл — энд засна
export const PAYMENT_INFO = 'Хаан банк: 5XXX XXXX · Хүлээн авагч: [нэр]';

// Баглааны зургийн FB цомгийн линк — энд засна (эсвэл .env-д FB_ALBUM_URL)
export const BOUQUET_ALBUM_URL = process.env.FB_ALBUM_URL || 'https://www.facebook.com/LaParadisoMN/photos_by';

// Үнэ харуулах эсэх — бодит үнэ бэлэн болоход true болгоно.
// false үед бот үнэ хэлэхгүй, "ажилтан тань үнийг баталгаажуулна" гэж чиглүүлнэ.
export const SHOW_PRICES = false;

// Дэлгүүрийн мэдээлэл — энд засна
export const SHOP_INFO = {
  address: 'Их Найд Plaza, 1 давхарт',
  hours: 'Өдөр бүр 10:00 – 20:00',
  maps: 'https://maps.app.goo.gl/a1hFqxr6im7mn6q17',
  delivery: '50,000₮-аас дээш захиалгад хотын А бүсэд хүргэлт хийнэ',
};
