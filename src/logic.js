import { openai } from './openai.js';

export const INITIAL_SESSION = {
  messages: [],
};

export const dataBase = {};

export async function initCommand(ctx) {
  dataBase[ctx.from.id] = 0;
  ctx.session = { ...INITIAL_SESSION };
  await ctx.reply('Жду вашего голосового или текстового сообщения');
}

export async function clearCommand(ctx) {
  ctx.session = { ...INITIAL_SESSION };
  await ctx.reply('Жду вашего голосового или текстового сообщения');
}

export async function processTextToChat(ctx, content) {
  try {
    ctx.session.messages.push({ role: openai.roles.USER, content });

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
