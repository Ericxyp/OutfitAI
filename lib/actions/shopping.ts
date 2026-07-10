"use server";

import {
  runShoppingWorkflow,
  type ShoppingWorkflowResult,
} from "@/lib/ai/workflows/shopping-workflow";
import type { ShoppingUserInput } from "@/lib/ai/analyze-product";
import { createClient } from "@/lib/supabase/server";

export type ShoppingCheckResult = ShoppingWorkflowResult;

export type CreateShoppingCheckResponse =
  | { success: true; result: ShoppingCheckResult }
  | {
      success: false;
      error: string;
      needsLogin?: boolean;
      needsMoreClothes?: boolean;
    };

function parseUserInput(formData: FormData): ShoppingUserInput {
  const productName = formData.get("productName")?.toString().trim();
  const price = formData.get("price")?.toString().trim();
  const brand = formData.get("brand")?.toString().trim();
  const productUrl = formData.get("productUrl")?.toString().trim();
  const question = formData.get("question")?.toString().trim();

  const userInput: ShoppingUserInput = {};

  if (productName) {
    userInput.productName = productName;
  }
  if (price) {
    userInput.price = price;
  }
  if (brand) {
    userInput.brand = brand;
  }
  if (productUrl) {
    userInput.productUrl = productUrl;
  }
  if (question) {
    userInput.question = question;
  }

  return userInput;
}

export async function createShoppingCheck(
  formData: FormData
): Promise<CreateShoppingCheckResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "请先登录",
      needsLogin: true,
    };
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { success: false, error: "请上传商品图片" };
  }

  const userInput = parseUserInput(formData);

  return runShoppingWorkflow({
    userId: user.id,
    image,
    userInput: Object.keys(userInput).length > 0 ? userInput : undefined,
  });
}
