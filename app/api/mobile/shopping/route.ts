import { NextResponse } from "next/server";
import type { ShoppingUserInput } from "@/lib/ai/analyze-product";
import { runShoppingWorkflow } from "@/lib/ai/workflows/shopping-workflow";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";

function parseUserInput(formData: FormData): ShoppingUserInput | undefined {
  const productName = formData.get("productName")?.toString().trim();
  const price = formData.get("price")?.toString().trim();
  const brand = formData.get("brand")?.toString().trim();
  const productUrl = formData.get("productUrl")?.toString().trim();
  const question = formData.get("question")?.toString().trim();

  const userInput: ShoppingUserInput = {};

  if (productName) userInput.productName = productName;
  if (price) userInput.price = price;
  if (brand) userInput.brand = brand;
  if (productUrl) userInput.productUrl = productUrl;
  if (question) userInput.question = question;

  return Object.keys(userInput).length > 0 ? userInput : undefined;
}

export async function POST(request: Request) {
  const authResult = await authenticateMobileRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return mobileErrorResponse("请求格式无效");
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return mobileErrorResponse("请上传商品图片");
  }

  const result = await runShoppingWorkflow({
    userId: user.id,
    image,
    userInput: parseUserInput(formData),
    supabase,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    result: result.result,
  });
}
