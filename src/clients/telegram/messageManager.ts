import { Context, Telegraf } from "telegraf";
import type { Message } from "typegram/message";
import { log_to_file } from "@/core/logger";
import { stringToUuid } from "@/core/uuid";
import { cache } from "@/adapters/cache";
import ImageDescriptionService from "@/services/image";

const MAX_MESSAGE_LENGTH = 4096;

export class MessageManager {
  private bot: Telegraf<Context>;
  private imageService: ImageDescriptionService;

  constructor(bot: Telegraf<Context>, openAiKey: string) {
    this.bot = bot;
    this.imageService = ImageDescriptionService.getInstance(openAiKey);
  }

  private async processImage(
    message: Message
  ): Promise<{ description: string } | null> {
    try {
      let imageUrl: string | null = null;

      if ("photo" in message && message.photo?.length > 0) {
        const photo = message.photo[message.photo.length - 1];
        const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
        imageUrl = fileLink.toString();
      } else if (
        "document" in message &&
        message.document?.mime_type?.startsWith("image/")
      ) {
        const fileLink = await this.bot.telegram.getFileLink(
          message.document.file_id
        );
        imageUrl = fileLink.toString();
      }

      if (imageUrl) {
        const { title, description } = await this.imageService.describeImage(
          imageUrl
        );
        return { description: `[Image: ${title}\n${description}]` };
      }
    } catch (error) {
      console.error("Error processing image:", error);
    }
    return null;
  }

  private splitMessage(text: string): string[] {
    const chunks: string[] = [];
    let currentChunk = "";

    const lines = text.split("\n");
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
        currentChunk += (currentChunk ? "\n" : "") + line;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      }
    }

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  public async handleMessage(ctx: Context): Promise<void> {
    if (!ctx.message || !ctx.from) return;

    const message = ctx.message;
    const datestr = new Date().toUTCString().replace(/:/g, "-");

    try {
      const userId = stringToUuid(ctx.from.id.toString());
      const userName =
        ctx.from.username || ctx.from.first_name || "Unknown User";

      // Handle images
      const imageInfo = await this.processImage(message);

      // Get text content
      let messageText = "";
      if ("text" in message) {
        messageText = message.text;
      } else if ("caption" in message && message.caption) {
        messageText = message.caption;
      }

      // Combine text and image description
      const fullText = imageInfo
        ? `${messageText} ${imageInfo.description}`
        : messageText;

      if (!fullText) return;

      // Log the message
      log_to_file(
        `telegram_message_${datestr}`,
        `From ${userName}: ${fullText} in ${ctx.chat?.type || "Unknown Chat"}`
      );

      // Store in cache if needed
      cache.set(`last_message_${userId}`, {
        text: fullText,
        timestamp: Date.now(),
      });

      // Send acknowledgment
      await ctx.reply(`${fullText}`);
    } catch (error) {
      console.error("Error handling message:", error);
      await ctx.reply(
        "Sorry, I encountered an error while processing your message."
      );
    }
  }
}
