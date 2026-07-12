import { PAGE_COPY } from "@/lib/constants";

const MAX_IMAGE_DIMENSION = 768;
const MAX_BASE64_SIZE = 900 * 1024;
const JPEG_QUALITY_INITIAL = 0.7;
const JPEG_QUALITY_REDUCED = 0.6;

function encodeCanvasToBase64(
  canvas: HTMLCanvasElement,
  quality: number
): string {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = dataUrl.split(",")[1];
  if (!base64) {
    throw new Error(PAGE_COPY.addClothing.imageProcessFailed);
  }
  return base64;
}

/**
 * 将图片压缩为 JPEG base64，仅用于单次请求生命周期，不写入 React 状态。
 */
export async function compressImageToBase64(
  file: File
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  const processError = PAGE_COPY.addClothing.imageProcessFailed;
  const tooLargeError = PAGE_COPY.addClothing.imageTooLarge;
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(processError));
      image.src = objectUrl;
    });

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(processError);
    }

    ctx.drawImage(img, 0, 0, width, height);

    let base64 = encodeCanvasToBase64(canvas, JPEG_QUALITY_INITIAL);
    if (base64.length > MAX_BASE64_SIZE) {
      base64 = encodeCanvasToBase64(canvas, JPEG_QUALITY_REDUCED);
    }
    if (base64.length > MAX_BASE64_SIZE) {
      throw new Error(tooLargeError);
    }

    return { base64, mimeType: "image/jpeg" };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === processError || error.message === tooLargeError)
    ) {
      throw error;
    }
    throw new Error(processError);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
