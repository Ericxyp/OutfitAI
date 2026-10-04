/**
 * “明天去健身穿什么”候选排序对比（精确自定义标签奖励前 / 后）。
 * 运行：npm run eval:gym-bonus
 *
 * 走真实链路：需求确认 Agent（关键词兜底，不调用模型）→ buildGenerationRequest →
 * 规则召回（含截断）→ 混合排序（embedding 相似度为固定假设值，不调用模型）。
 * 输出 JSON，便于与改动前的代码（同一脚本）逐项对比。
 */
import "./test-helpers/stub-next-cache";
import * as retriever from "@/lib/recommendation/closet-retriever";
import * as ruleEngine from "@/lib/recommendation/rule-engine";
import { analyzeRequirement, buildGenerationRequest } from "@/lib/requirements/agent";
import type { ClosetItem } from "@/types/database";
import type { WeatherContext } from "@/types/weather";

let idCounter = 0;
function item(partial: Partial<ClosetItem> & { name: string; category: string }): ClosetItem {
  idCounter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`,
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    image_url: null,
    color: null,
    material: null,
    style_tags: [],
    season_tags: [],
    occasion_tags: [],
    custom_style_tags: [],
    custom_occasion_tags: [],
    notes: null,
    status: "ready",
    embedding: null,
    embedding_text: null,
    embedding_updated_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

/** 30 件衣橱（> 20 件，会触发 pickBalancedCandidates 截断） */
export function buildGymCloset(): ClosetItem[] {
  idCounter = 0;
  return [
    item({ name: "速干运动T恤", category: "上衣", color: "黑色", material: "聚酯纤维", style_tags: ["运动"], occasion_tags: ["运动"] }),
    item({ name: "白色基础T恤", category: "上衣", color: "白色", material: "棉", style_tags: ["休闲", "简约"], occasion_tags: ["日常", "周末"] }),
    item({ name: "条纹长袖T恤", category: "上衣", color: "蓝色", material: "棉", style_tags: ["休闲"], occasion_tags: ["周末", "日常"] }),
    item({ name: "牛津纺衬衫", category: "上衣", color: "白色", material: "棉", style_tags: ["简约", "通勤"], occasion_tags: ["上班", "日常"] }),
    item({ name: "米色针织衫", category: "上衣", color: "米色", material: "羊毛", style_tags: ["温柔"], occasion_tags: ["约会", "日常"] }),
    item({ name: "黑色高领打底", category: "上衣", color: "黑色", material: "棉", style_tags: ["简约"], occasion_tags: ["日常", "上班"] }),
    item({ name: "灰色Polo衫", category: "上衣", color: "灰色", material: "棉", style_tags: ["休闲", "简约"], occasion_tags: ["周末", "日常"] }),
    item({ name: "卡其工装衬衫", category: "上衣", color: "卡其", material: "棉", style_tags: ["街头", "休闲"], occasion_tags: ["旅行", "日常"] }),
    // 目标单品：系统标签只有“休闲 / 日常”，用户自定义场景“健身”（较晚加入衣橱，排在同分上衣之后）
    item({ name: "灰色连帽卫衣", category: "上衣", color: "灰色", material: "棉", style_tags: ["休闲"], occasion_tags: ["日常"], custom_occasion_tags: ["健身"] }),
    item({ name: "藏青卫衣", category: "上衣", color: "藏青", material: "棉", style_tags: ["休闲"], occasion_tags: ["周末"] }),
    item({ name: "印花短袖", category: "上衣", color: "白色", material: "棉", style_tags: ["街头"], occasion_tags: ["旅行"] }),
    item({ name: "丝质衬衫", category: "上衣", color: "杏色", material: "真丝", style_tags: ["优雅"], occasion_tags: ["约会", "上班"] }),
    item({ name: "运动短裤", category: "裤子", color: "黑色", material: "聚酯纤维", style_tags: ["运动"], occasion_tags: ["运动"] }),
    item({ name: "黑色束脚运动裤", category: "裤子", color: "黑色", material: "棉", style_tags: ["运动", "休闲"], occasion_tags: ["运动", "日常"] }),
    item({ name: "浅蓝牛仔裤", category: "裤子", color: "蓝色", material: "牛仔", style_tags: ["休闲"], occasion_tags: ["日常", "周末"] }),
    item({ name: "卡其休闲裤", category: "裤子", color: "卡其", material: "棉", style_tags: ["简约"], occasion_tags: ["上班", "日常"] }),
    item({ name: "黑色西裤", category: "裤子", color: "黑色", material: "羊毛", style_tags: ["正式"], occasion_tags: ["上班"] }),
    item({ name: "灰色阔腿裤", category: "裤子", color: "灰色", material: "棉", style_tags: ["休闲"], occasion_tags: ["周末"] }),
    item({ name: "防风运动夹克", category: "外套", color: "黑色", material: "尼龙", style_tags: ["运动"], occasion_tags: ["运动", "户外"] }),
    item({ name: "牛仔夹克", category: "外套", color: "蓝色", material: "牛仔", style_tags: ["休闲", "街头"], occasion_tags: ["周末"] }),
    item({ name: "驼色大衣", category: "外套", color: "驼色", material: "毛呢", style_tags: ["优雅"], occasion_tags: ["上班", "约会"] }),
    item({ name: "黑色西装外套", category: "外套", color: "黑色", material: "羊毛", style_tags: ["正式"], occasion_tags: ["上班"] }),
    item({ name: "白色跑鞋", category: "鞋子", color: "白色", style_tags: ["运动"], occasion_tags: ["运动", "日常"] }),
    item({ name: "帆布鞋", category: "鞋子", color: "白色", material: "帆布", style_tags: ["休闲"], occasion_tags: ["日常"] }),
    item({ name: "黑色乐福鞋", category: "鞋子", color: "黑色", material: "皮革", style_tags: ["简约"], occasion_tags: ["上班"] }),
    item({ name: "切尔西靴", category: "鞋子", color: "棕色", material: "皮革", style_tags: ["复古"], occasion_tags: ["约会"] }),
    item({ name: "运动腰包", category: "配饰", color: "黑色", style_tags: ["运动"], occasion_tags: ["运动"] }),
    item({ name: "棒球帽", category: "配饰", color: "黑色", style_tags: ["休闲", "街头"], occasion_tags: ["周末"] }),
    item({ name: "托特包", category: "包", color: "米色", style_tags: ["简约"], occasion_tags: ["上班"] }),
    item({ name: "银色项链", category: "配饰", color: "银色", style_tags: ["精致"], occasion_tags: ["约会"] }),
  ];
}

/** 假设的语义相似度（不调用 embedding 服务）；卫衣因 embedding_text 含“自定义场景：健身”而较高 */
function assumedSimilarity(entry: ClosetItem): number {
  if (entry.name === "灰色连帽卫衣") return 0.62;
  if ((entry.occasion_tags ?? []).includes("运动")) return 0.58;
  return 0.35;
}

const WEATHER: WeatherContext = { source: "eval", locationName: "上海", temperatureC: 20, condition: "多云", date: "2026-10-04" };

async function main() {
  // 屏蔽服务端 debug 日志，stdout 只输出结果 JSON
  const print = console.log.bind(console);
  console.log = () => {};
  const closet = buildGymCloset();
  const analysis = await analyzeRequirement(
    { text: "明天去健身穿什么", contextLocation: { type: "city", city: "Shanghai" }, timeZone: "Asia/Shanghai" },
    {
      modelClient: null,
      lookupWeather: async () => ({ status: "unavailable" as const }),
      loadClosetItems: async () => [],
      now: () => new Date("2026-10-03T02:00:00Z"),
    }
  );
  if (analysis.result.status !== "ready_for_confirmation") {
    throw new Error(`requirement not ready: ${analysis.result.status}`);
  }
  const generation = buildGenerationRequest(analysis.result.requirement);
  const rawTerms = (generation.options as { requirementTerms?: unknown }).requirementTerms;
  // 与工作流一致：服务端清洗结构化词（改动前的代码没有该函数）
  const sanitize = (ruleEngine as { sanitizeRequirementTerms?: (raw: unknown) => unknown }).sanitizeRequirementTerms;
  const requirementTerms = sanitize ? sanitize(rawTerms) : undefined;

  const input = {
    closetItems: closet,
    requestText: generation.requestText,
    weatherContext: WEATHER,
    styleProfile: null,
    requirementTerms,
  } as Parameters<typeof retriever.retrieveClosetCandidatesSafe>[0];

  const rule = retriever.retrieveClosetCandidatesSafe(input);
  const hybrid = retriever.mergeHybridClosetRetrieval(
    rule,
    closet.map((entry) => ({ item: entry, embeddingSimilarity: assumedSimilarity(entry) })),
    input
  );

  // 全量规则排序（截断前），用于观察卫衣在所有上衣中的名次
  const requirement = ruleEngine.parseRecommendationRequirement(
    generation.requestText,
    requirementTerms as never
  );
  const fullRanking = closet
    .map((entry) => ruleEngine.scoreClosetItem(entry, { requirement, weatherContext: WEATHER, styleProfile: null }))
    .sort((a, b) => b.ruleScore - a.ruleScore);

  const round = (value: number | undefined) => (typeof value === "number" ? Math.round(value * 10) / 10 : null);
  const describe = (result: typeof rule) =>
    result.debugScores.map((score, index) => ({
      rank: index + 1,
      name: score.name,
      category: score.category,
      ruleScore: round(score.ruleScore),
      semanticScore: round(score.semanticScore),
      customTagBonus: score.customTagBonus ?? 0,
      finalScore: round(score.finalScore ?? score.total),
    }));

  const output = {
    requestText: generation.requestText,
    requirementTerms: rawTerms ?? null,
    occasion: analysis.result.requirement.occasion,
    fullRuleRankingTops: fullRanking
      .filter((scored) => scored.item.category === "上衣")
      .map((scored, index) => ({ rank: index + 1, name: scored.item.name, ruleScore: round(scored.ruleScore) })),
    ruleCandidates: describe(rule),
    hybridCandidates: describe(hybrid),
    hoodieInRuleCandidates: rule.candidateItems.some((entry) => entry.name === "灰色连帽卫衣"),
    hoodieInHybridCandidates: hybrid.candidateItems.some((entry) => entry.name === "灰色连帽卫衣"),
  };
  print(JSON.stringify(output, null, 2));
}

// 被其他脚本 import（只复用衣橱夹具）时不执行
if (process.argv[1]?.includes("eval-gym-custom-bonus")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
