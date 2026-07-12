import {
  extractStyleKnowledgeKeywords,
  rankStyleKnowledgeEntries,
  retrieveStyleKnowledge,
} from "@/lib/knowledge/retrieve-style-knowledge";
import type { StyleKnowledgeEntry } from "@/lib/knowledge/style-knowledge";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const MOCK_ENTRIES: StyleKnowledgeEntry[] = [
  {
    id: "c1000001-0001-4000-8000-000000000001",
    title: "通勤穿搭规则",
    category: "occasion",
    tags: ["通勤", "上班", "职场", "会议"],
    content: "通勤穿搭优先利落、干净、耐看。",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000008",
    title: "显高穿搭规则",
    category: "body_goal",
    tags: ["显高", "比例", "利落"],
    content: "显高可优先高腰下装、九分裤、纵向线条和简洁同色延伸。",
    priority: 9,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000002",
    title: "约会穿搭规则",
    category: "occasion",
    tags: ["约会", "温柔", "优雅"],
    content: "约会穿搭可适当增加精致感与柔和度。",
    priority: 9,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000007",
    title: "雨天穿搭规则",
    category: "weather",
    tags: ["雨天", "下雨", "防水", "耐脏"],
    content: "雨天优先防水或耐脏鞋、深色下装和可遮挡雨势的外套。",
    priority: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000003",
    title: "旅行穿搭规则",
    category: "occasion",
    tags: ["旅行", "出游", "周末", "休闲", "舒适"],
    content: "旅行穿搭强调舒适、耐穿、便于活动。建议分层穿搭，便于早晚温差调节。",
    priority: 8,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000011",
    title: "低饱和简约风格规则",
    category: "style",
    tags: ["简约", "低饱和", "通勤", "黑白灰", "中性色", "韩系"],
    content: "低饱和简约风格以黑白灰、米白、藏青、卡其为主，减少高饱和撞色。",
    priority: 8,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000012",
    title: "色彩协调规则",
    category: "color",
    tags: ["色彩", "配色", "协调", "同色系", "对比色"],
    content: "全身颜色建议控制在 2-3 个主色。同色系搭配更稳妥，深浅层次可增加高级感。",
    priority: 8,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c1000001-0001-4000-8000-000000000013",
    title: "鞋包配饰规则",
    category: "item",
    tags: ["鞋子", "包包", "配饰", "通勤", "精致"],
    content: "鞋包配饰决定整体完成度。通勤优先简洁皮鞋、乐福鞋或干净运动鞋。",
    priority: 7,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function rankForQuery(
  query: string,
  options?: {
    occasion?: string;
    weatherSummary?: string;
    limit?: number;
  }
) {
  const keywords = extractStyleKnowledgeKeywords({
    supabase: {} as SupabaseClient<Database>,
    query,
    occasion: options?.occasion,
    weatherSummary: options?.weatherSummary,
  });
  return rankStyleKnowledgeEntries(
    MOCK_ENTRIES,
    keywords,
    options?.limit ?? 6
  );
}

async function testOfficeTallerQuery() {
  const results = rankForQuery("今天上班想显高一点");
  const titles = results.map((entry) => entry.title);

  assert(
    titles.includes("通勤穿搭规则"),
    `expected 通勤穿搭规则 in results, got: ${titles.join("、")}`
  );
  assert(
    titles.includes("显高穿搭规则"),
    `expected 显高穿搭规则 in results, got: ${titles.join("、")}`
  );

  console.log("[PASS] keyword ranking for 今天上班想显高一点");
  console.log(`  matched: ${titles.join("、")}`);
}

async function testRainyDateQuery() {
  const results = rankForQuery("雨天约会穿什么");
  const titles = results.map((entry) => entry.title);

  assert(
    titles.includes("雨天穿搭规则"),
    `expected 雨天穿搭规则 in results, got: ${titles.join("、")}`
  );
  assert(
    titles.includes("约会穿搭规则"),
    `expected 约会穿搭规则 in results, got: ${titles.join("、")}`
  );

  console.log("[PASS] keyword ranking for 雨天约会穿什么");
  console.log(`  matched: ${titles.join("、")}`);
}

async function testTravelQuery() {
  const results = rankForQuery("北京 3 天旅行 城市漫游 韩系简约", {
    occasion: "旅行、城市漫游",
  });
  const titles = results.map((entry) => entry.title);

  assert(
    titles.includes("旅行穿搭规则"),
    `expected 旅行穿搭规则 in results, got: ${titles.join("、")}`
  );
  assert(
    titles.some(
      (title) =>
        title.includes("低饱和") ||
        title.includes("色彩") ||
        title.includes("舒适")
    ),
    `expected style/color knowledge in results, got: ${titles.join("、")}`
  );

  console.log("[PASS] keyword ranking for 北京 3 天旅行 城市漫游 韩系简约");
  console.log(`  matched: ${titles.join("、")}`);
}

async function testShoppingQuery() {
  const results = rankForQuery("白色外套 通勤 简约 值不值得买", {
    occasion: "通勤",
  });
  const titles = results.map((entry) => entry.title);

  assert(
    titles.includes("通勤穿搭规则"),
    `expected 通勤穿搭规则 in results, got: ${titles.join("、")}`
  );
  assert(
    titles.some(
      (title) =>
        title.includes("色彩") ||
        title.includes("低饱和") ||
        title.includes("鞋包配饰")
    ),
    `expected 色彩/简约/配饰 knowledge in results, got: ${titles.join("、")}`
  );

  console.log("[PASS] keyword ranking for 白色外套 通勤 简约 值不值得买");
  console.log(`  matched: ${titles.join("、")}`);
}

async function testRetrieveFailureSafe() {
  const failingSupabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({
                data: null,
                error: { message: "mock query failed" },
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  const results = await retrieveStyleKnowledge({
    supabase: failingSupabase,
    query: "今天上班想显高一点",
  });

  assert(Array.isArray(results), "retrieveStyleKnowledge should return array");
  assert(results.length === 0, "failed query should return empty array");

  console.log("[PASS] retrieveStyleKnowledge returns [] on query failure");
}

async function testEmptyKnowledgeBase() {
  const emptySupabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  const results = await retrieveStyleKnowledge({
    supabase: emptySupabase,
    query: "雨天约会穿什么",
  });

  assert(results.length === 0, "empty knowledge base should return []");

  console.log("[PASS] retrieveStyleKnowledge returns [] for empty knowledge base");
}

async function main() {
  await testOfficeTallerQuery();
  await testRainyDateQuery();
  await testTravelQuery();
  await testShoppingQuery();
  await testRetrieveFailureSafe();
  await testEmptyKnowledgeBase();
  console.log("\nAll style knowledge tests passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] ${message}`);
  process.exit(1);
});
