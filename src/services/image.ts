import fs from "fs";
// @ts-ignore
import gifFrames from "gif-frames";
import os from "os";
import path from "path";
import { type IAgentRuntime } from "@/core/types";
class ImageDescriptionService {
  private static instance: ImageDescriptionService | null = null;
  private apiKey: string;

  private constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public static getInstance(apiKey: string): ImageDescriptionService {
    if (!ImageDescriptionService.instance) {
      ImageDescriptionService.instance = new ImageDescriptionService(apiKey);
    }
    return ImageDescriptionService.instance;
  }

  async describeImage(imageUrl: string): Promise<{ title: string; description: string }> {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Describe this image and give it a title. The first line should be the title, and then a line break, then a detailed description." },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 300,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content;
      const [title, ...descriptionParts] = text.split("\n");
      const description = descriptionParts.join("\n");
      
      return { title, description };
    } catch (error) {
      console.error("Error in image description:", error);
      throw error;
    }
  }
}

export default ImageDescriptionService;