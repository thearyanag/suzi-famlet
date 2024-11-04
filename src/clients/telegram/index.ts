import { Context, Telegraf } from "telegraf";
import { MessageManager } from "./messageManager";

export class TelegramClient {
  private bot: Telegraf<Context>;
  private messageManager: MessageManager;

  constructor(botToken: string, openAiKey: string) {
    console.log("📱 Constructing new TelegramClient...");
    this.bot = new Telegraf(botToken);
    this.messageManager = new MessageManager(this.bot, openAiKey);

    this.setupHandlers();
    console.log("✅ TelegramClient constructor completed");
  }

  private setupHandlers() {
    this.bot.on("message", async (ctx) => {
      try {
        await this.messageManager.handleMessage(ctx);
      } catch (error) {
        console.error("❌ Error handling message:", error);
        await ctx.reply("An error occurred while processing your message.");
      }
    });

    this.bot.catch((err, ctx) => {
      console.error(`❌ Telegram Error for ${ctx.updateType}:`, err);
      ctx.reply("An unexpected error occurred. Please try again later.");
    });
  }

  public async start(): Promise<void> {
    console.log("🚀 Starting Telegram bot...");
    try {
      await this.bot.launch({
        dropPendingUpdates: true,
      });
      console.log("✨ Telegram bot successfully launched!");
      console.log(`Bot username: @${this.bot.botInfo?.username}`);

      process.once("SIGINT", () => this.stop());
      process.once("SIGTERM", () => this.stop());
    } catch (error) {
      console.error("❌ Failed to launch Telegram bot:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    console.log("Stopping Telegram bot...");
    await this.bot.stop();
    console.log("Telegram bot stopped");
  }
}