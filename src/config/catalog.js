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
  DONE: 'done',
};

// Дансны мэдээлэл — энд засна
export const PAYMENT_INFO = 'Хаан банк: 5XXX XXXX · Хүлээн авагч: [нэр]';
