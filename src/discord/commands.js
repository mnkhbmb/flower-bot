import { SlashCommandBuilder } from 'discord.js';

// Командууд бүртгэх
export const commands = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Өнөөдрийн орлогын тайлан харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('irts')
    .setDescription('Ирц бүртгэх')
    .addStringOption(o => o.setName('torol').setDescription('Ирсэн/Гарсан').setRequired(true)
      .addChoices(
        { name: '🟢 Ирлээ', value: 'in' },
        { name: '🔴 Гарлаа', value: 'out' },
      ))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('haalt')
    .setDescription('Өдрийн хаалт оруулах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('aguulah_nem')
    .setDescription('Агуулахд бараа нэмэх')
    .addStringOption(o => o.setName('tovch').setDescription('Товчлол (Са, Ро, Ба...)').setRequired(true))
    .addIntegerOption(o => o.setName('too').setDescription('Нэмэх тоо').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('aguulah')
    .setDescription('Агуулахын одоогийн байдал харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('aguulah_shine')
    .setDescription('Агуулахад ШИНЭ бараа бүртгэх (хаалтад танигдаагүй товчлол гарвал)')
    .addStringOption(o => o.setName('ner').setDescription('Бараа нэр (ж: Цахирмаа)').setRequired(true))
    .addStringOption(o => o.setName('tovch').setDescription('Товчлол, таслалаар олноор (ж: цах,tsah)').setRequired(true))
    .addIntegerOption(o => o.setName('too').setDescription('Одоогийн үлдэгдэл').setRequired(true))
    .addIntegerOption(o => o.setName('anhaaruulga').setDescription('Анхааруулгын доод хэмжээ (default 5)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tsalin')
    .setDescription('Энэ хугацааны цалингийн тооцоо харах')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('hansh')
    .setDescription('Юанийн ханш харах / тохируулах (бараа таталтыг төгрөг болгоход)')
    .addNumberOption(o => o.setName('yuan').setDescription('1 юань = хэдэн төгрөг (ж: 495)')
      .setMinValue(1).setMaxValue(10000).setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('horogdol')
    .setDescription('Хорогдол (гэмтсэн, хаясан цэцэг) бүртгэх')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zarsan')
    .setDescription('Хамгийн их зарагдсан цэцэг (хаалтын мэдээллээс)')
    .addIntegerOption(o => o.setName('honog').setDescription('Сүүлийн хэдэн хоног (default 30)')
      .setMinValue(1).setMaxValue(365).setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zeel')
    .setDescription('Зээл бүртгэх (ажилтных цалингаас хасагдана, бусдынх буцаатал үлдэнэ)')
    .addIntegerOption(o => o.setName('dun').setDescription('Авсан дүн (₮)').setRequired(true))
    .addStringOption(o => o.setName('ner').setDescription('Хэн авсан бэ? (хоосон бол өөрийн нэр)')
      .setRequired(false).setAutocomplete(true))
    .addStringOption(o => o.setName('temdeglel').setDescription('Тэмдэглэл').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zeel-hynah')
    .setDescription('Зээлийн хяналт: хэн хэдийг авсан, үлдэгдэл (нэр бичвэл түүх нь)')
    .addStringOption(o => o.setName('ner').setDescription('Зээлдэгчийн нэр').setRequired(false).setAutocomplete(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('zeel-butsalt')
    .setDescription('Зээлийн буцаалт бүртгэх / үлдэгдэл харах (хоосон бол бүх төлөгдөөгүй зээл)')
    .addStringOption(o => o.setName('ner').setDescription('Зээлтэй хүний нэр').setRequired(false).setAutocomplete(true))
    .addIntegerOption(o => o.setName('dun').setDescription('Буцаасан дүн (₮)').setMinValue(1).setRequired(false))
    .addStringOption(o => o.setName('temdeglel').setDescription('Тэмдэглэл').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tsalin-unelgee')
    .setDescription('Ажилтны өдрийн цалин харах / тохируулах (тохируулаагүй бол үндсэн дүнгээр)')
    .addStringOption(o => o.setName('ner').setDescription('Ажилтны нэр (Ирц дээрхтэй ижил)')
      .setRequired(false).setAutocomplete(true))
    .addIntegerOption(o => o.setName('dun').setDescription('Өдрийн цалин ₮ (0 = үндсэн дүнд буцаах)')
      .setMinValue(0).setMaxValue(10000000).setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('dans-uldegdel')
    .setDescription('Дансны үлдэгдэл харах / тохируулах (тэр мөчөөс хойших орлого, зарлагыг нэмж явна)')
    .addStringOption(o => o.setName('dans').setDescription('Аль данс').setRequired(false).setAutocomplete(true))
    .addIntegerOption(o => o.setName('dun').setDescription('Банкны апп дээрх одоогийн үлдэгдэл (₮)').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tulgalt')
    .setDescription('Хаалтын Пос/Данс-ыг банкаар орсонтой тулгах (энэ цалингийн хугацаа)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('guilgee')
    .setDescription('Банкны бодит орлого / зарлага (ангиллаар)')
    .addIntegerOption(o => o.setName('honog').setDescription('Сүүлийн хэдэн хоног (default 30)')
      .setMinValue(1).setMaxValue(365).setRequired(false))
    .toJSON(),
];
