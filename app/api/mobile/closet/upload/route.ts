import { NextResponse } from "next/server";
import { uploadMobileClosetItem } from "@/lib/api/mobile/closet-upload-handler";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";

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
    return mobileErrorResponse("请上传衣服图片");
  }

  const result = await uploadMobileClosetItem(supabase, user.id, image);

  if (!result.success) {
    return mobileErrorResponse(result.error, 400);
  }

  return NextResponse.json({
    success: true,
    item: result.item,
  });
}
