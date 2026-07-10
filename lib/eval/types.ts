import type { OutfitAIResponse } from "@/lib/ai/generate-outfit";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type { ClosetItem } from "@/types/database";
import type { WeatherContext } from "@/types/weather";

export type EvalCaseExpected = {
  requiredOccasionHints?: string[];
  requiredStyleHints?: string[];
  forbiddenItemIds?: string[];
  forbiddenVisiblePatterns?: string[];
  shouldAvoidHeavyItemsWhenHot?: boolean;
  shouldPreferOuterwearWhenCold?: boolean;
};

export type EvalCase = {
  id: string;
  requestText: string;
  weatherContext?: WeatherContext;
  expected: EvalCaseExpected;
};

export type EvalAssertionContext = {
  result: OutfitAIResponse;
  closetItems: ClosetItem[];
  styleProfile: StyleProfileContext | null;
  weatherContext?: WeatherContext | null;
  evalCase: EvalCase;
};

export type AssertionRunResult = {
  passed: boolean;
  failures: string[];
  warnings: string[];
};

export type EvalCaseRunResult = {
  caseId: string;
  requestText: string;
  passed: boolean;
  failures: string[];
  warnings: string[];
  error?: string;
};
