import { Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import { code } from 'telegraf/format';
import config from 'config';
import { ogg } from './ogg.js';
import { openai } from './openai.js';

const INITIAL_SESSION = {
  messages: [],
};

// ======
const bot = new Telegraf(config.get('TELEGRAM_TOKEN'));

export async function processTextToChat(ctx, content) {
  try {
    // пушим сообщения пользователя в сессию (в контекст)
    ctx.session.messages.push({ role: openai.roles.USER, content });
    // пушим сообщения бота в сессию (в контекст)
    const response = await openai.chat(ctx.session.messages);
    ctx.session.messages.push({
      role: openai.roles.ASSISTANT,
      content: response.content,
    });
    await ctx.reply(response.content);
  } catch (e) {
    console.log('Error while proccesing text to gpt', e.message);
  }
}

// говорим боту, чтобы он использовал session
bot.use(session());

// при вызове команды new и start бот регистрирует новую беседу,
// новый контекст

bot.command('new', async (ctx) => {
  ctx.session = INITIAL_SESSION;
  await ctx.reply('Жду вашего голосового или текстового сообщения');
});

bot.command('start', async (ctx) => {
  ctx.session = INITIAL_SESSION;
  await ctx.reply('Жду вашего голосового или текстового сообщения');
});

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
    await processTextToChat(ctx, text);
  } catch (e) {
    console.log('Error while voice message', e.message);
  }
});

bot.on(message('text'), async (ctx) => {
  ctx.session ??= INITIAL_SESSION;
  try {
    await ctx.reply(code('Сообщение принял. Жду ответ от сервера...'));
    await processTextToChat(ctx, ctx.message.text);
  } catch (e) {
    console.log(`Error while voice message`, e.message);
  }
});

bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать диалог' },
  { command: 'new', description: 'Новый диалог' },
]);

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
