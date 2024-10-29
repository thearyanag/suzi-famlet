import fs from "fs";
// @ts-ignore
import gifFrames from "gif-frames";
import os from "os";
import path from "path";
import { type IAgentRuntime } from "@/core/types";

class ImageDescriptionService {
  private static instance: ImageDescriptionService | null = null;
  private modelId: string = "gpt-4o-mini";
  private device: string = "cloud";
  runtime: IAgentRuntime;

  private constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.initialize();
  }

  public static getInstance(runtime: IAgentRuntime): ImageDescriptionService {
    if (!ImageDescriptionService.instance) {
      ImageDescriptionService.instance = new ImageDescriptionService(runtime);
    }
    return ImageDescriptionService.instance;
  }

  async initialize(): Promise<void> {
    if (this.runtime.getSetting("OPENAI_API_KEY")) {
      this.modelId = "gpt-4o-mini";
      this.device = "cloud";
    } else {
      throw new Error("OPENAI_API_KEY is not set.");
    }
  }

  async describeImage(imageUrl: string): Promise<{ title: string; description: string }> {
    return this.recognizeWithOpenAI(imageUrl);
  }

  private async recognizeWithOpenAI(
    imageUrl: string,
  ): Promise<{ title: string; description: string }> {
    const isGif = imageUrl.toLowerCase().endsWith(".gif");
    let imageData: Buffer | null = null;

    try {
      if (isGif) {
        console.log("Processing GIF: extracting first frame");
        const { filePath } = await this.extractFirstFrameFromGif(imageUrl);
        imageData = fs.readFileSync(filePath);
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        imageData = Buffer.from(await response.arrayBuffer());
      }

      if (!imageData || imageData.length === 0) {
        throw new Error("Failed to fetch image data");
      }

      const prompt =
        "Describe this image and give it a title. The first line should be the title, and then a line break, then a detailed description of the image. Respond with the format 'title\ndescription'";

      const text = await this.requestOpenAI(imageUrl, imageData, prompt, isGif);
      const [title, ...descriptionParts] = text.split("\n");
      const description = descriptionParts.join("\n");
      return { title, description };
    } catch (error) {
      console.error("Error in recognizeWithOpenAI:", error);
      throw error;
    }
  }

  private async requestOpenAI(
    imageUrl: string,
    imageData: Buffer,
    prompt: string,
    isGif: boolean,
  ): Promise<string> {
    for (let retryAttempts = 0; retryAttempts < 3; retryAttempts++) {
      try {
        let body;
        if (isGif) {
          const base64Image = imageData.toString("base64");
          body = JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  {
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${base64Image}` },
                  },
                ],
              },
            ],
            max_tokens: 500,
          });
        } else {
          body = JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 300,
          });
        }

        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.runtime.getSetting("OPENAI_API_KEY")}`,
            },
            body: body,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
      } catch (error) {
        console.log(
          `Error during OpenAI request (attempt ${retryAttempts + 1}):`,
          error,
        );
        if (retryAttempts === 2) {
          throw error;
        }
      }
    }
    throw new Error("Failed to recognize image with OpenAI after 3 attempts");
  }

  private async extractFirstFrameFromGif(
    gifUrl: string,
  ): Promise<{ filePath: string }> {
    const frameData = await gifFrames({
      url: gifUrl,
      frames: 1,
      outputType: "png",
    });
    const firstFrame = frameData[0];

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `gif_frame_${Date.now()}.png`);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(tempFilePath);
      firstFrame.getImage().pipe(writeStream);

      writeStream.on("finish", () => {
        resolve({ filePath: tempFilePath });
      });

      writeStream.on("error", reject);
    });
  }
}

export default ImageDescriptionService;