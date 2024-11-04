import { TelegramClient } from "./clients/telegram";

const telegramClient = new TelegramClient(
  process.env.BOT_TOKEN!,
  process.env.OPEN_AI_KEY!
);

telegramClient.start();
