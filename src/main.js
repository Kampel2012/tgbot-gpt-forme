import { Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import { code } from 'telegraf/format';
import config from 'config';
import { ogg } from './ogg.js';
import { openai } from './openai.js';

//console.log(config.get('TEST_ENV'));

const SESSION_TIMEOUT = 20 * 60 * 1000;
const INITIAL_SESSION = {
  messages: [],
};

const bot = new Telegraf(config.get('TELEGRAM_TOKEN'));

let timerReset = setTimeout(() => {}, SESSION_TIMEOUT);

bot.use(session());

function resetSession(ctx) {
  ctx.session = INITIAL_SESSION;
  ctx.reply('Завершение сессии.');
}

bot.command('new', async (ctx) => {
  ctx.session = INITIAL_SESSION;
  await ctx.reply('Жду вашего голосового или текстового сообщения');
});

bot.command('start', async (ctx) => {
  ctx.session = INITIAL_SESSION;
  await ctx.reply('Жду вашего голосового или текстового сообщения');
  clearInterval(timerReset);
  timerReset = setTimeout(() => {
    resetSession(ctx);
  }, SESSION_TIMEOUT);
});

bot.on(message('voice'), async (ctx) => {
  ctx.session ??= INITIAL_SESSION;
  try {
    await ctx.reply(code('Сообщение принял. Жду ответ от сервера...'));
    const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const userId = String(ctx.message.from.id);
    const oggPath = await ogg.create(link.href, userId);
    const mp3Path = await ogg.toMp3(oggPath, userId);

    const text = await openai.transcription(mp3Path);
    await ctx.reply(code(`Ваш запрос: ${text}`));

    ctx.session.messages.push({ role: openai.roles.USER, content: text });

    const response = await openai.chat(ctx.session.messages);

    ctx.session.messages.push({
      role: openai.roles.ASSISTANT,
      content: response.content,
    });

    await ctx.reply(response.content);

    clearInterval(timerReset);
    timerReset = setTimeout(() => {
      resetSession(ctx);
    }, SESSION_TIMEOUT);
  } catch (e) {
    console.log('Error while voice message', e.message);
  }
});

bot.on(message('text'), async (ctx) => {
  ctx.session ??= INITIAL_SESSION;
  try {
    await ctx.reply(code('Сообщение принял. Жду ответ от сервера...'));

    ctx.session.messages.push({
      role: openai.roles.USER,
      content: ctx.message.text,
    });

    const response = await openai.chat(ctx.session.messages);

    ctx.session.messages.push({
      role: openai.roles.ASSISTANT,
      content: response.content,
    });

    await ctx.reply(response.content);
    clearInterval(timerReset);
    timerReset = setTimeout(() => {
      resetSession(ctx);
    }, SESSION_TIMEOUT);
  } catch (e) {
    console.log('Error while voice message', e.message);
  }
});

bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать диалог' },
  /*   { command: 'new', description: 'Новый диалог' }, */
]);

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
