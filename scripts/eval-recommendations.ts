import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { generateOutfit } from "@/lib/ai/generate-outfit";
import { runAssertions } from "@/lib/eval/assertions";
import type { EvalCaseRunResult } from "@/lib/eval/types";
import { MIN_CLOSET_FOR_AI } from "@/lib/constants";
import {
  buildRecommendationContext,
  retrieveClosetCandidatesSafe,
} from "@/lib/recommendation/closet-retriever";
import { parseRecommendationRequirement } from "@/lib/recommendation/rule-engine";
import {
  evalCases,
  mockClosetItems,
  mockPersonalProfile,
  mockStyleProfile,
} from "./eval-fixtures";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

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

function selectCases() {
  let cases = [...evalCases];

  if (process.env.EVAL_CASE) {
    cases = cases.filter((item) => item.id === process.env.EVAL_CASE);
    if (cases.length === 0) {
      console.error(`未找到评测 case: ${process.env.EVAL_CASE}`);
      process.exit(1);
    }
  }

  const limit = Number(process.env.EVAL_LIMIT);
  if (Number.isFinite(limit) && limit > 0) {
    cases = cases.slice(0, limit);
  }

  return cases;
}

function printCaseResult(result: EvalCaseRunResult) {
  const status = result.error
    ? "FAIL"
    : result.passed
      ? result.warnings.length > 0
        ? "WARN"
        : "PASS"
      : "FAIL";

  console.log(`[${status}] ${result.caseId}: ${result.requestText}`);

  if (result.error) {
    console.log(`  - ${result.error}`);
    return;
  }

  for (const failure of result.failures) {
    console.log(`  - ${failure}`);
  }

  for (const warning of result.warnings) {
    console.log(`  - ${warning}`);
  }
}

async function runCase(caseItem: (typeof evalCases)[number]): Promise<EvalCaseRunResult> {
  const retrieval = retrieveClosetCandidatesSafe({
    closetItems: mockClosetItems,
    requestText: caseItem.requestText,
    weatherContext: caseItem.weatherContext ?? null,
    styleProfile: mockStyleProfile,
  });

  const requirement = parseRecommendationRequirement(caseItem.requestText);
  const recommendationContext = buildRecommendationContext(
    retrieval,
    requirement,
    mockClosetItems.length
  );

  const candidateItems =
    retrieval.candidateItems.length >= MIN_CLOSET_FOR_AI
      ? retrieval.candidateItems
      : mockClosetItems;

  try {
    const result = await generateOutfit(caseItem.requestText, candidateItems, {
      weatherContext: caseItem.weatherContext,
      styleProfile: mockStyleProfile,
      personalProfile: mockPersonalProfile,
      recommendationContext,
      fullClosetItems: mockClosetItems,
    });

    const assertionResult = runAssertions({
      result,
      closetItems: mockClosetItems,
      styleProfile: mockStyleProfile,
      weatherContext: caseItem.weatherContext ?? null,
      evalCase: caseItem,
    });

    return {
      caseId: caseItem.id,
      requestText: caseItem.requestText,
      passed: assertionResult.passed,
      failures: assertionResult.failures,
      warnings: assertionResult.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      caseId: caseItem.id,
      requestText: caseItem.requestText,
      passed: false,
      failures: [],
      warnings: [],
      error: message,
    };
  }
}

async function main() {
  loadEnvLocal();

  if (!process.env.QWEN_API_KEY) {
    console.log("QWEN_API_KEY 未配置，跳过 AI 评测");
    process.exit(0);
  }

  const cases = selectCases();
  console.log(`Running ${cases.length} recommendation eval case(s)...\n`);

  const results: EvalCaseRunResult[] = [];

  for (const caseItem of cases) {
    const result = await runCase(caseItem);
    results.push(result);
    printCaseResult(result);
    console.log("");
  }

  const failedCount = results.filter((result) => !result.passed).length;
  const warningCount = results.filter(
    (result) => result.passed && result.warnings.length > 0
  ).length;
  const passedCount = results.length - failedCount;

  console.log("Summary");
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Warnings: ${warningCount}`);

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Eval script failed: ${message}`);
  process.exit(1);
});
