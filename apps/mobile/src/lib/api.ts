import type {
  ApiErrorResponse,
  ClosetItem,
  FeedbackRating,
  GenerateShoppingCheckInput,
  GenerateTravelPlanInput,
  MobileProfileResponse,
  RecommendationResult,
  ShoppingCheckResult,
  TravelPlanResult,
} from "@/types/api";
import { supabase } from "@/lib/supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export const isApiConfigured = API_BASE_URL.length > 0;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!isApiConfigured) {
    throw new Error("未配置 EXPO_PUBLIC_API_BASE_URL");
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error("请先登录");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = (await response.json()) as T | ApiErrorResponse;

  if (!response.ok || (data as ApiErrorResponse).success === false) {
    const message =
      (data as ApiErrorResponse).error ??
      `请求失败（${response.status}）`;
    throw new Error(message);
  }

  return data as T;
}

export async function fetchRecommendations(input: {
  requestText: string;
  location?: { latitude: number; longitude: number };
}): Promise<RecommendationResult> {
  const data = await apiRequest<{
    success: true;
    recommendation: RecommendationResult;
  }>("/api/mobile/recommendations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.recommendation;
}

export async function fetchClosetItems(): Promise<ClosetItem[]> {
  const data = await apiRequest<{ success: true; items: ClosetItem[] }>(
    "/api/mobile/closet"
  );
  return data.items;
}

export async function uploadClosetImage(imageUri: string): Promise<ClosetItem> {
  const formData = new FormData();
  const filename = imageUri.split("/").pop() ?? "photo.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const ext = match?.[1]?.toLowerCase() ?? "jpg";
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";

  formData.append("image", {
    uri: imageUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  const data = await apiRequest<{ success: true; item: ClosetItem }>(
    "/api/mobile/closet/upload",
    {
      method: "POST",
      body: formData,
    }
  );
  return data.item;
}

export async function submitFeedback(input: {
  recommendationId: string;
  rating: FeedbackRating;
  reasonTags?: string[];
}): Promise<void> {
  await apiRequest<{ success: true; rating: FeedbackRating }>(
    "/api/mobile/feedback",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function fetchProfile(): Promise<MobileProfileResponse> {
  return apiRequest<MobileProfileResponse>("/api/mobile/profile");
}

export async function generateTravelPlan(
  input: GenerateTravelPlanInput
): Promise<TravelPlanResult> {
  const data = await apiRequest<{ success: true; plan: TravelPlanResult }>(
    "/api/mobile/travel",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
  return data.plan;
}

export async function generateShoppingCheck(
  input: GenerateShoppingCheckInput
): Promise<ShoppingCheckResult> {
  const formData = new FormData();
  const filename = input.imageUri.split("/").pop() ?? "product.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const ext = match?.[1]?.toLowerCase() ?? "jpg";
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";

  formData.append("image", {
    uri: input.imageUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  if (input.productName) formData.append("productName", input.productName);
  if (input.price) formData.append("price", input.price);
  if (input.brand) formData.append("brand", input.brand);
  if (input.productUrl) formData.append("productUrl", input.productUrl);
  if (input.question) formData.append("question", input.question);

  const data = await apiRequest<{ success: true; result: ShoppingCheckResult }>(
    "/api/mobile/shopping",
    {
      method: "POST",
      body: formData,
    }
  );
  return data.result;
}

export function getWebUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
