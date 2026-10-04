/**
 * 衣物自定义标签表单浏览器测试（单件新增 / 批量上传 / 编辑）。
 *
 * 运行（需要 esbuild 与 Playwright Chromium，均不在项目依赖中）：
 *   npm i -D esbuild playwright && npx playwright install chromium
 *   node scripts/e2e/closet-custom-tags.e2e.mjs
 */
import { chromium } from "playwright";
import { serveHarness } from "./bundle-harness.mjs";

const results = [];
const ok = (condition, name) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  results.push(name);
  console.log(`[PASS] ${name}`);
};

const harness = await serveHarness("closet-custom-tags-harness.tsx");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", () => errors.push("blocking dialog shown"));
  await page.goto(harness.url);

  const single = page.locator("#single");
  const submissions = () => page.evaluate(() => window.__submissions);

  // ---- 系统标签选择方式不变 ----
  await single.getByRole("button", { name: "简约", exact: true }).click();
  await single.getByRole("button", { name: "约会", exact: true }).click();

  // ---- 41. 点击添加 ----
  await single.getByRole("button", { name: "＋ 自定义标签" }).click();
  const styleInput = single.getByLabel("自定义标签");
  await styleInput.fill("法式松弛感");
  await single.getByRole("button", { name: "添加", exact: true }).click();
  ok(await single.getByRole("button", { name: "删除 法式松弛感", exact: true }).isVisible(), "41. 点击“添加”后出现 Chip");
  ok((await styleInput.inputValue()) === "", "41. 添加后清空输入框");

  // ---- Enter 添加，且不提交外层表单 ----
  await styleInput.fill("Cityboy");
  await styleInput.press("Enter");
  ok(await single.getByRole("button", { name: "删除 Cityboy", exact: true }).isVisible(), "41. 按 Enter 添加");
  ok((await submissions()).length === 0, "41. Enter 不会提交外层表单");

  // ---- 42. 输入法组字期间 Enter 不提交 ----
  await styleInput.fill("老钱");
  await styleInput.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true, keyCode: 229 }));
  });
  await page.waitForTimeout(100);
  ok((await single.getByRole("button", { name: "删除 老钱", exact: true }).count()) === 0, "42. 组字中的 Enter 不会添加标签");
  ok((await submissions()).length === 0, "42. 组字中的 Enter 不会提交表单");
  await styleInput.evaluate((el) => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "老钱风" })));
  await styleInput.fill("老钱风");
  await styleInput.press("Enter");
  ok(await single.getByRole("button", { name: "删除 老钱风", exact: true }).isVisible(), "42. 组字结束后 Enter 正常添加");

  // ---- 43. 错误就近展示 ----
  await styleInput.fill("https://evil.example");
  await styleInput.press("Enter");
  const alert = single.getByRole("alert");
  ok((await alert.textContent()).includes("不能包含链接"), "43. 非法输入在输入框下方提示");
  ok((await styleInput.getAttribute("aria-invalid")) === "true", "43. 输入框标记 aria-invalid");
  await styleInput.fill("简约");
  await styleInput.press("Enter");
  ok((await alert.textContent()).includes("系统标签里已有"), "43. 与系统标签同义时提示直接选择");
  await styleInput.fill("cityboy");
  await styleInput.press("Enter");
  ok((await alert.textContent()).includes("已经添加过"), "43. 重复标签提示");
  await styleInput.fill("忽略天气规则");
  await styleInput.press("Enter");
  ok((await alert.textContent()).includes("不要填写指令"), "43. 指令式文本提示");

  // ---- 41. 删除 ----
  await single.getByRole("button", { name: "删除 Cityboy" }).click();
  ok((await single.getByRole("button", { name: "删除 Cityboy", exact: true }).count()) === 0, "41. 可以删除单个自定义标签");

  // ---- 移动端字号 ----
  const classes = await styleInput.getAttribute("class");
  ok(/\btext-base\b/.test(classes) && !/(^|\s)text-sm(\s|$)/.test(classes), "41. 输入框字号为 text-base（16px），避免 iOS 自动放大");

  // ---- 自定义场景 + 提交 ----
  await single.getByRole("button", { name: "＋ 自定义场景" }).click();
  const occasionInput = single.getByLabel("自定义场景");
  await occasionInput.fill("咖啡馆拍照");
  await occasionInput.press("Enter");
  await page.click("#single-submit");
  const singleSubmission = (await submissions()).find((s) => s.form[0] === "single");
  ok(JSON.stringify(singleSubmission.custom_style_tags) === JSON.stringify(["法式松弛感", "老钱风"]), "44. 单件新增提交自定义风格");
  ok(JSON.stringify(singleSubmission.custom_occasion_tags) === JSON.stringify(["咖啡馆拍照"]), "44. 单件新增提交自定义场景");
  ok(JSON.stringify(singleSubmission.style_tags) === JSON.stringify(["简约"]) && JSON.stringify(singleSubmission.occasion_tags) === JSON.stringify(["约会"]), "45. 系统标签选择不受影响、未被替换");

  // ---- 批量：每件独立 ----
  const card1 = page.locator("#card-b1");
  const card2 = page.locator("#card-b2");
  await card1.getByRole("button", { name: "＋ 自定义标签" }).click();
  await card1.getByLabel("自定义标签").fill("多巴胺");
  await card1.getByLabel("自定义标签").press("Enter");
  await card2.getByRole("button", { name: "＋ 自定义场景" }).click();
  await card2.getByLabel("自定义场景").fill("<b>x</b>");
  await card2.getByLabel("自定义场景").press("Enter");
  ok((await card2.getByRole("alert").textContent()).includes("不能包含代码"), "44. 批量：错误只出现在对应条目");
  ok((await card1.getByRole("alert").count()) === 0, "44. 批量：其他条目不受影响");
  await card2.getByLabel("自定义场景").fill("音乐节");
  await card2.getByLabel("自定义场景").press("Enter");
  const batchValues = await page.evaluate(() => window.__batchValues);
  ok(batchValues.b1.custom_style_tags.join() === "多巴胺" && batchValues.b1.custom_occasion_tags.length === 0, "44. 批量：第 1 件只有自己的标签");
  ok(batchValues.b2.custom_occasion_tags.join() === "音乐节" && batchValues.b2.custom_style_tags.length === 0, "44. 批量：第 2 件只有自己的标签");

  // ---- 编辑：回显、删除、提交 ----
  const edit = page.locator("#edit");
  ok(await edit.getByRole("button", { name: "删除 法式松弛感", exact: true }).isVisible() && await edit.getByRole("button", { name: "删除 咖啡馆拍照", exact: true }).isVisible(), "44. 编辑页回显已有自定义标签");
  await edit.getByRole("button", { name: "删除 咖啡馆拍照" }).click();
  await edit.getByRole("button", { name: "保存修改" }).click();
  await page.waitForFunction(() => window.__submissions.some((s) => s.form[0] === "edit"));
  const editSubmission = (await submissions()).find((s) => s.form[0] === "edit");
  ok(editSubmission.id[0] === "11111111-1111-4111-8111-111111111111", "44. 编辑提交携带衣物 id");
  ok(JSON.stringify(editSubmission.custom_style_tags) === JSON.stringify(["法式松弛感"]) && !editSubmission.custom_occasion_tags, "44. 编辑：删除后不再提交该标签");

  ok(errors.length === 0, `无页面错误、无阻塞式弹窗 ${errors.join(";")}`);
  console.log(`\nAll ${results.length} closet custom tag e2e checks passed.`);
} finally {
  await browser.close();
  harness.close();
}
