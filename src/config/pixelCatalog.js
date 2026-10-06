// Пиксел баглааны сайтын сонголтууд — сервер талд захиалгыг шалгах, нэрлэхэд хэрэглэнэ.
// Зураг (sprite) нь public/baglaa.html дотор байгаа; энд зөвхөн id → нэр.
// Сайтад шинэ сонголт нэмбэл ХОЁР газар нэмнэ.
export const PIXEL = {
  flowers: {
    sarnai: 'Сарнай', tseene: 'Цээнэ', romashka: 'Ромашка', gerbera: 'Гербера',
    narants: 'Наранцэцэг', lili: 'Лили', udval: 'Удвал', matiol: 'Матиола', statis: 'Статис',
  },
  fillers: { uvs: 'Өвс', navch: 'Навч', jijig: 'Жижиг цэцэг' },
  papers:  { kraft: 'Крафт', white: 'Цагаан', pink: 'Ягаан', lilac: 'Голт бор', black: 'Хар' },
  ribbons: { red: 'Улаан', pink: 'Ягаан', white: 'Цагаан', gold: 'Алтлаг', blue: 'Цэнхэр', black: 'Хар' },
};

export const LIMITS = { flowers: 18, fillers: 10, message: 60, leadHours: 2, openHour: 10, closeHour: 20 };
