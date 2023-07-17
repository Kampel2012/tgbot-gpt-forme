import { Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import { code } from 'telegraf/format';
import config from 'config';
import { ogg } from './ogg.js';
import { openai } from './openai.js';
import { removeFile } from './utils.js';
import {
  initCommand,
  processTextToChat,
  INITIAL_SESSION,
  clearCommand,
  dataBase,
} from './logic.js';

function decreaseBalance(ctx) {
  dataBase[ctx.from.id] = dataBase[ctx.from.id]
    ? +dataBase[ctx.from.id] - 1
    : 0;
}

const bot = new Telegraf(config.get('TELEGRAM_TOKEN'));

bot.use(session());

const testPay = (ctx) => {
  // это обработчик конкретного текста, данном случае это - "pay"
  return ctx.replyWithInvoice(getInvoice(ctx.from.id)); //  метод replyWithInvoice для выставления счета
};

bot.command('start', initCommand);

bot.command('new', clearCommand);

bot.command('pay', testPay);

bot.command('check', async (ctx) => {
  await ctx.reply(`Ваш баланс ${dataBase[ctx.from.id] || 0} запросов`);
});

bot.telegram.setMyCommands([
  { command: 'new', description: 'Новый диалог' },
  { command: 'pay', description: 'Оплата' },
  { command: 'check', description: 'Проверить баланс' },
]);

bot.on(message('voice'), async (ctx) => {
  ctx.session ??= INITIAL_SESSION;
  try {
    await ctx.reply(code('Сообщение принял. Жду ответ от сервера...'));
    const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const userId = String(ctx.message.from.id);
    const oggPath = await ogg.create(link.href, userId);
    const mp3Path = await ogg.toMp3(oggPath, userId);

    removeFile(oggPath);

    const text = await openai.transcription(mp3Path);
    await ctx.reply(code(`Ваш запрос: ${text}`));

    decreaseBalance(ctx);

    await processTextToChat(ctx, text);
  } catch (e) {
    console.log(`Error while voice message`, e.message);
  }
});

bot.on(message('text'), async (ctx) => {
  ctx.session ??= INITIAL_SESSION;
  try {
    await ctx.reply(code('Сообщение принял. Жду ответ от сервера...'));

    decreaseBalance(ctx);

    await processTextToChat(ctx, ctx.message.text);
  } catch (e) {
    console.log(`Error while voice message`, e.message);
  }
});

const getInvoice = (id) => {
  const invoice = {
    chat_id: id, // Уникальный идентификатор целевого чата или имя пользователя целевого канала
    provider_token: '381764678:TEST:61808', // токен выданный через бот @SberbankPaymentBot
    start_parameter: 'get_access', //Уникальный параметр глубинных ссылок. Если оставить поле пустым, переадресованные копии отправленного сообщения будут иметь кнопку «Оплатить», позволяющую нескольким пользователям производить оплату непосредственно из пересылаемого сообщения, используя один и тот же счет. Если не пусто, перенаправленные копии отправленного сообщения будут иметь кнопку URL с глубокой ссылкой на бота (вместо кнопки оплаты) со значением, используемым в качестве начального параметра.
    title: 'InvoiceTitle', // Название продукта, 1-32 символа
    description: 'InvoiceDescription', // Описание продукта, 1-255 знаков
    currency: 'RUB', // Трехбуквенный код валюты ISO 4217
    prices: [{ label: 'Invoice Title', amount: 100 * 100 }], // Разбивка цен, сериализованный список компонентов в формате JSON 100 копеек * 100 = 100 рублей
    photo_url:
      'https://st-gdefon.gallery.world/wallpapers_original/241687_gallery.world.jpg', // URL фотографии товара для счета-фактуры. Это может быть фотография товара или рекламное изображение услуги. Людям больше нравится, когда они видят, за что платят.
    photo_width: 500, // Ширина фото
    photo_height: 281, // Длина фото
    payload: {
      // Полезные данные счета-фактуры, определенные ботом, 1–128 байт. Это не будет отображаться пользователю, используйте его для своих внутренних процессов.
      unique_id: `${id}_${Number(new Date())}`,
      provider_token: '381764678:TEST:61808',
    },
  };

  return invoice;
};

bot.use(Telegraf.log());

bot.on(message('pay'), testPay);

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true)); // ответ на предварительный запрос по оплате

bot.on('successful_payment', async (ctx, next) => {
  dataBase[ctx.from.id] = dataBase[ctx.from.id]
    ? +dataBase[ctx.from.id] + 50
    : 50;
  // ответ в случае положительной оплаты
  await ctx.reply('Оплата успешно прошла');
  await ctx.reply(`Ваш баланс ${dataBase[ctx.from.id]} запросов`);
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
