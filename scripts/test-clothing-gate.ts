import { normalizeClothingAnalysis } from "@/lib/ai/analyze-clothing";
import {
  getClothingRejectionError,
  isAcceptableClothing,
  NON_CLOTHING_REJECTION_MESSAGE,
} from "@/lib/closet/clothing-gate";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testRejectCorn() {
  const analysis = normalizeClothingAnalysis({
    is_clothing: false,
    rejection_reason: "图片主体是玉米，属于食物，不是穿戴类物品",
    confidence: 0.97,
    name: "玉米",
    category: "上衣",
  });

  assert(analysis.is_clothing === false, "corn should not be clothing");
  assert(
    !isAcceptableClothing(analysis),
    "corn should fail clothing gate"
  );
  assert(
    analysis.rejection_reason?.includes("玉米") === true,
    "corn rejection reason should mention 玉米"
  );
  assert(analysis.category === "", "non-clothing should not keep forced category");

  console.log("[PASS] corn/food image rejected");
}

function testAcceptTShirt() {
  const analysis = normalizeClothingAnalysis({
    is_clothing: true,
    name: "白色棉质 T 恤",
    category: "上衣",
    color: "白色",
    material: "棉",
    style_tags: ["休闲"],
    season_tags: ["夏"],
    occasion_tags: ["日常"],
    notes: "",
    confidence: 0.92,
  });

  assert(analysis.is_clothing === true, "t-shirt should be clothing");
  assert(isAcceptableClothing(analysis), "t-shirt should pass clothing gate");
  assert(analysis.name === "白色棉质 T 恤", "t-shirt name preserved");

  console.log("[PASS] t-shirt accepted");
}

function testAcceptShoesBagHat() {
  const cases = [
    {
      label: "shoes",
      raw: {
        is_clothing: true,
        name: "白色运动鞋",
        category: "鞋子",
        confidence: 0.9,
      },
    },
    {
      label: "bag",
      raw: {
        is_clothing: true,
        name: "托特包",
        category: "包",
        confidence: 0.88,
      },
    },
    {
      label: "hat",
      raw: {
        is_clothing: true,
        name: "渔夫帽",
        category: "配饰",
        confidence: 0.86,
      },
    },
  ];

  for (const testCase of cases) {
    const analysis = normalizeClothingAnalysis(testCase.raw);
    assert(
      isAcceptableClothing(analysis),
      `${testCase.label} should pass clothing gate`
    );
  }

  console.log("[PASS] shoes/bag/hat accepted");
}

function testDefaultRejectionMessage() {
  const analysis = normalizeClothingAnalysis({
    is_clothing: false,
    confidence: 0.8,
  });

  assert(
    getClothingRejectionError(analysis) ===
      "图片主体不是可加入衣橱的穿戴类物品",
    "missing rejection_reason should use analysis fallback"
  );
  assert(
    NON_CLOTHING_REJECTION_MESSAGE.includes("不是衣物"),
    "UI fallback copy should mention non-clothing"
  );

  console.log("[PASS] default rejection messages");
}

function printManualTestGuide() {
  console.log("\n手动测试建议：");
  console.log("1. Web /closet/add 上传玉米或食物图片 → AI 识别后应提示不能加入衣橱，且无「放进衣橱」按钮");
  console.log("2. 上传 T 恤图片 → 可识别并正常加入衣橱");
  console.log("3. 上传鞋/包/帽子图片 → 可识别并正常加入衣橱");
  console.log("4. 若绕过前端直接提交非衣物图片，Server Action 应拒绝保存");
}

function main() {
  testRejectCorn();
  testAcceptTShirt();
  testAcceptShoesBagHat();
  testDefaultRejectionMessage();
  printManualTestGuide();
  console.log("\nAll clothing gate tests passed.");
}

main();
