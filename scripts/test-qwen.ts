/**
 * Qwen / DashScope 模型可用性测试
 * 用法: npm run test:qwen
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import OpenAI from "openai";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function formatError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    return [
      error.message,
      error.status ? `HTTP ${error.status}` : null,
      error.code ? `code=${error.code}` : null,
      error.type ? `type=${error.type}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

type TestImage = {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
};

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** 生成纯色 PNG，满足 qwen3-vl-plus 最小尺寸要求（>10px） */
function createTestPng(
  width: number,
  height: number,
  rgb: [number, number, number] = [74, 144, 226]
): TestImage {
  const rows: Buffer[] = [];

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const offset = 1 + x * 3;
      row[offset] = rgb[0];
      row[offset + 1] = rgb[1];
      row[offset + 2] = rgb[2];
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  return {
    base64: png.toString("base64"),
    mimeType: "image/png",
    width,
    height,
  };
}

async function testText(client: OpenAI, model: string) {
  console.log("\n[1/2] Text test");
  const startTime = Date.now();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: '请只返回 JSON：{"ok":true}',
        },
      ],
      response_format: { type: "json_object" },
    });

    const elapsedMs = Date.now() - startTime;
    console.log("✓ text success");
    console.log("  elapsedMs:", elapsedMs);
    console.log("  content:", response.choices[0]?.message?.content);
    return true;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error("✗ text failed");
    console.error("  elapsedMs:", elapsedMs);
    if (error instanceof OpenAI.APIError) {
      console.error("  error.name:", error.name);
      console.error("  error.message:", error.message);
      console.error("  error.status:", error.status);
      console.error("  error.code:", error.code);
    } else {
      console.error("  error:", formatError(error));
    }
    return false;
  }
}

async function testVision(client: OpenAI, model: string) {
  console.log("\n[2/2] Vision test (64x64 PNG)");
  const startTime = Date.now();
  const testImage = createTestPng(64, 64);
  const { base64, mimeType, width, height } = testImage;
  const base64Length = base64.length;

  console.log("  width:", width);
  console.log("  height:", height);
  console.log("  base64Length:", base64Length);
  console.log("  mimeType:", mimeType);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "请只返回 JSON：{\"ok\":true}" },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const elapsedMs = Date.now() - startTime;
    console.log("Vision: OK");
    console.log("  elapsedMs:", elapsedMs);
    console.log("  content:", response.choices[0]?.message?.content);
    return true;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error("✗ vision failed");
    console.error("  elapsedMs:", elapsedMs);
    if (error instanceof OpenAI.APIError) {
      console.error("  error.name:", error.name);
      console.error("  error.message:", error.message);
      console.error("  error.status:", error.status);
      console.error("  error.code:", error.code);
    } else {
      console.error("  error:", formatError(error));
    }
    return false;
  }
}

async function main() {
  loadEnvLocal();

  const apiKey = process.env.QWEN_API_KEY;
  const baseURL =
    process.env.QWEN_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL || "qwen3-vl-plus";

  console.log("Qwen model test");
  console.log("QWEN_BASE_URL:", baseURL);
  console.log("QWEN_MODEL:", model);
  console.log("QWEN_API_KEY configured:", apiKey ? "yes (value hidden)" : "no");
  console.log("Client timeout: 60000ms, maxRetries: 0");

  if (!apiKey) {
    console.error("\n✗ QWEN_API_KEY missing in .env.local");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 60000,
    maxRetries: 0,
  });

  const textOk = await testText(client, model);
  const visionOk = await testVision(client, model);

  console.log("\nSummary");
  console.log("- Text:", textOk ? "OK" : "FAIL");
  console.log("- Vision:", visionOk ? "OK" : "FAIL");

  if (!textOk || !visionOk) {
    console.log(
      "\nIf qwen3-vl-plus times out, check QWEN_API_KEY, network, and DashScope quota."
    );
    process.exit(1);
  }

  console.log("\nAll tests passed.");
}

main().catch((error) => {
  console.error("Unexpected test runner error:", error);
  process.exit(1);
});
