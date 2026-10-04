/**
 * ChatProvider 浏览器集成测试：站内切页不中断需求解析 / 推荐生成。
 *
 * 运行（需要本机可用的 esbuild 与 Playwright Chromium，均不在项目依赖中）：
 *   npm i -D esbuild playwright && npx playwright install chromium
 *   node scripts/e2e/chat-provider.e2e.mjs
 *
 * Server Action 在打包时替换为 mock（见 chat-provider-harness.tsx），不访问网络、不消耗额度。
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "outfitai-e2e-"));

await build({
  entryPoints: [path.join(here, "chat-provider-harness.tsx")],
  bundle: true,
  outfile: path.join(outDir, "out.js"),
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  nodePaths: [path.join(root, "node_modules"), ...(process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean)],
  logLevel: "warning",
  plugins: [
    {
      name: "outfitai-stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, () => ({ path: "next-shim", namespace: "shim" }));
        b.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
          loader: "tsx",
          resolveDir: root,
          contents: `
            export default function Link({ href, children, ...rest }) { return <a href={href} {...rest}>{children}</a>; }
            export function usePathname() { return "/"; }
            export function useRouter() { return { push() {}, refresh() {}, replace() {} }; }
            export function useSearchParams() { return new URLSearchParams(); }`,
        }));
        b.onResolve({ filter: /^@\// }, (args) =>
          b.resolve("./" + args.path.slice(2), { resolveDir: root, kind: args.kind })
        );
        // "use server" 模块 → 调用 window.__serverActions 中的 mock
        b.onLoad({ filter: /[\\/](lib|app)[\\/]actions[\\/][^\\/]+\.ts$/ }, (args) => {
          const source = fs.readFileSync(args.path, "utf8");
          if (!/^\s*["']use server["']/.test(source)) return undefined;
          const rel = path.relative(root, args.path).split(path.sep).join("/");
          const names = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
          return {
            loader: "js",
            contents: names
              .map(
                (name) =>
                  `export const ${name} = (...a) => { const m = window.__serverActions?.[${JSON.stringify(rel)}]?.${name}; return m ? m(...a) : Promise.resolve(undefined); };`
              )
              .join("\n"),
          };
        });
      },
    },
  ],
});

fs.writeFileSync(
  path.join(outDir, "index.html"),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="out.js"></script></body></html>'
);

const server = http
  .createServer((req, res) => {
    const file = req.url === "/" ? "index.html" : req.url.slice(1).split("?")[0];
    try {
      res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
      res.end(fs.readFileSync(path.join(outDir, file)));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  })
  .listen(0);
const port = server.address().port;

const results = [];
const ok = (condition, name) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  results.push(name);
  console.log(`[PASS] ${name}`);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://localhost:${port}/`);

  const h = (fn, arg) => page.evaluate(fn, arg);
  const calls = () => h(() => ({ ...window.__harness.calls }));
  const hold = (kind) => h((k) => window.__harness.hold(k), kind);
  const release = (kind) => h((k) => window.__harness.release(k), kind);
  const go = async (id) => {
    await page.click(`#nav-${id}`);
  };
  const send = async (text) => {
    const box = page.locator("textarea");
    await box.fill(text);
    await box.press("Enter");
  };
  const settle = () => page.waitForTimeout(150);
  const chatBoxMounted = () => page.locator("textarea").count();

  // ---- 1/2. extracting 期间切到衣橱，返回后显示追问卡 ----
  await hold("analyze");
  await send("明天去朝阳公园穿什么");
  await page.waitForFunction(() => window.__harness.calls.analyze === 1);
  await go("closet");
  ok((await chatBoxMounted()) === 0, "1. 切到衣橱后首页 ChatBox 已卸载");
  await release("analyze");
  await settle();
  await go("home");
  await page.getByText("主要是散步、运动、拍照还是约会？").waitFor({ timeout: 3000 });
  ok(true, "2. extracting 期间离开首页，返回后显示追问卡");
  ok((await page.getByText("明天去朝阳公园穿什么").count()) === 1, "2. 用户消息保留且只出现一次");

  // ---- 4. 切页不重复调用需求解析 ----
  for (const id of ["profile", "home", "closet", "home"]) await go(id);
  await settle();
  ok((await calls()).analyze === 1, "4. 多次切页不会重复调用需求解析");

  // ---- 3. generating 期间切到“我的”，返回后显示推荐卡 ----
  await page.getByRole("button", { name: "拍照", exact: true }).click();
  await page.getByText("我理解的需求是：").waitFor();
  await hold("confirm");
  await page.getByRole("button", { name: "确认生成" }).click();
  await page.waitForFunction(() => window.__harness.calls.confirm === 1);
  await go("profile");
  ok((await chatBoxMounted()) === 0, "3. 生成中切到我的页面，ChatBox 已卸载");
  await release("confirm");
  await settle();
  await go("home");
  await page.getByText("测试推荐 #1").waitFor({ timeout: 3000 });
  ok(true, "3. generating 期间离开首页，返回后显示推荐卡");
  ok((await page.getByText("我理解的需求是：").count()) === 0, "3. 确认卡在生成完成后关闭");

  // ---- 5. 切页不重复调用推荐生成 ----
  for (const id of ["closet", "home", "profile", "home"]) await go(id);
  await settle();
  const afterNav = await calls();
  ok(afterNav.confirm === 1 && afterNav.validate === 1, "5. 切页不会重复调用推荐生成");
  ok(!afterNav.generateRecommendation, "5. 首页不会绕过确认直接调用旧生成接口");

  // ---- 12. 返回首页后“换一套”复用正确参数 ----
  await page.getByRole("button", { name: "换一套" }).click();
  await page.getByText(/换一套结果/).waitFor();
  const regenArgs = await h(() => window.__harness.args.regenerate);
  ok(
    JSON.stringify(regenArgs[2]) ===
      JSON.stringify({ location: { type: "city", city: "Beijing" }, targetDate: "2026-10-04", requirementNotes: "避免：花哨" }),
    "12. 返回首页后“换一套”复用原生成参数（地点 / 日期 / 补充要求）"
  );
  ok(Array.isArray(regenArgs[1]) && regenArgs[1][0] === "item-1", "12. 换一套带上上次选用的单品");

  // ---- 6. 重复点击确认只生成一次（且离开首页也不影响）----
  await send("今天上班穿什么");
  await page.getByText("你会在哪个城市？我会参考当地天气。").waitFor();
  await page.getByRole("button", { name: "不考虑天气，继续" }).click();
  await page.getByText("我理解的需求是：").waitFor();
  await hold("confirm");
  const confirmButton = page.getByRole("button", { name: "确认生成" });
  await confirmButton.click();
  await page.locator("button", { hasText: /确认生成|校验中…|生成中…/ }).click({ force: true }).catch(() => {});
  await go("closet");
  await go("home");
  await page.locator("button", { hasText: /确认生成|校验中…|生成中…/ }).click({ force: true }).catch(() => {});
  await release("confirm");
  await page.getByText("测试推荐 #3").waitFor({ timeout: 3000 });
  ok((await calls()).confirm === 2, "6. 重复点击确认（含切页前后）只生成一次");

  // ---- 7. 旧请求晚到不能覆盖新状态 ----
  await send("周末约会穿什么");
  await page.getByRole("button", { name: "不考虑天气，继续" }).click();
  await page.getByText("我理解的需求是：").waitFor();
  await page.getByRole("button", { name: "修改需求" }).click();
  await hold("analyze");
  await send("改成后天");
  await page.waitForFunction(() => (window.__harness.calls.analyze ?? 0) >= 6);
  await go("closet");
  await go("home");
  ok((await page.locator("textarea").isDisabled()), "7. 解析进行中输入框禁用，快速发送不会创建重复任务");
  ok((await page.getByRole("button", { name: "发送" }).isDisabled()), "7. 解析进行中发送按钮禁用");
  await release("analyze");
  await page.getByText(/（后天）/).waitFor();
  await page.getByRole("button", { name: "取消" }).last().click();
  await page.getByText("好的，已取消这次需求，不会生成推荐。").last().waitFor();
  ok((await page.getByText("我理解的需求是：").count()) === 0, "7. 取消后状态为空闲");

  // ---- 8. A 账号的任务结果不能写入 B 账号 ----
  await send("今天上班穿什么");
  await page.getByRole("button", { name: "不考虑天气，继续" }).click();
  await page.getByText("我理解的需求是：").waitFor();
  await hold("confirm");
  await page.getByRole("button", { name: "确认生成" }).click();
  await page.waitForFunction(() => window.__harness.calls.confirm === 3);
  await go("profile");
  await page.click("#user-b");
  await release("confirm");
  await settle();
  await go("home");
  await settle();
  ok((await page.getByText(/测试推荐/).count()) === 0, "8. A 的生成结果不会出现在 B 账号");
  ok((await page.getByText("我理解的需求是：").count()) === 0, "8. B 账号看不到 A 的需求状态");
  const bKey = "outfitai.chat.messages:22222222-2222-4222-8222-222222222222";
  ok((await h((k) => localStorage.getItem(k), bKey)) === null, "8. B 账号本地没有写入 A 的消息");

  // ---- 9. A / B 聊天消息隔离 ----
  await send("B 的穿搭问题");
  await page.getByText("B 的穿搭问题").waitFor();
  await page.getByRole("button", { name: "取消" }).last().click().catch(() => {});
  await page.click("#user-a");
  await settle();
  ok((await page.getByText("B 的穿搭问题").count()) === 0, "9. A 看不到 B 的消息");
  ok((await page.getByText("明天去朝阳公园穿什么").count()) === 1, "9. 切回 A 加载 A 自己的消息");
  await page.click("#user-b");
  await settle();
  ok((await page.getByText("B 的穿搭问题").count()) === 1 && (await page.getByText("明天去朝阳公园穿什么").count()) === 0, "9. 切回 B 只看到 B 的消息");

  // ---- 10. 匿名消息不与登录账号共享 ----
  await page.click("#user-anon");
  await settle();
  ok((await page.locator("text=B 的穿搭问题").count()) === 0 && (await page.locator("text=明天去朝阳公园穿什么").count()) === 0, "10. 匿名状态看不到登录账号消息");
  await send("匿名用户的问题");
  await page.getByText("匿名用户的问题").waitFor();
  await page.getByRole("button", { name: "取消" }).last().click().catch(() => {});
  const keys = await h(() => Object.keys(localStorage).filter((k) => k.startsWith("outfitai.chat.messages")).sort());
  ok(
    JSON.stringify(keys) ===
      JSON.stringify([
        "outfitai.chat.messages:11111111-1111-4111-8111-111111111111",
        "outfitai.chat.messages:22222222-2222-4222-8222-222222222222",
        "outfitai.chat.messages:anonymous",
      ]),
    "10. 每个身份一个独立 key，没有全局 key"
  );
  await page.click("#user-a");
  await settle();
  ok((await page.getByText("匿名用户的问题").count()) === 0, "10. 登录账号看不到匿名消息");

  // ---- 11. 非法本地缓存不会导致崩溃 ----
  await h(() => {
    localStorage.setItem("outfitai.chat.messages:22222222-2222-4222-8222-222222222222", "{broken");
    localStorage.setItem("outfitai.chat.messages", JSON.stringify([{ id: "x", role: "user", content: "旧版全局消息" }]));
  });
  await page.click("#user-b");
  await settle();
  ok((await page.locator("textarea").count()) === 1 && errors.length === 0, "11. 非法缓存不会导致页面崩溃");
  ok((await page.getByText("旧版全局消息").count()) === 0, "11. 旧版全局消息不会迁移到登录账号");
  ok((await h(() => localStorage.getItem("outfitai.chat.messages"))) === null, "11. 旧版全局 key 被删除");

  // ---- 13. 清空对话清除当前账号消息与稳定状态 ----
  await page.click("#user-a");
  await settle();
  await send("明天出去穿什么");
  await page.getByText("这次主要是什么场合？").waitFor();
  await page.getByRole("button", { name: "清空对话" }).click();
  await settle();
  ok((await page.getByText("这次主要是什么场合？").count()) === 0, "13. 清空对话后追问卡消失");
  ok((await page.getByText("明天去朝阳公园穿什么").count()) === 0, "13. 清空对话后消息消失");
  ok((await h(() => localStorage.getItem("outfitai.chat.messages:11111111-1111-4111-8111-111111111111"))) === null, "13. 当前账号消息 key 已清除");
  ok((await h(() => sessionStorage.getItem("outfitai.requirement.draft:11111111-1111-4111-8111-111111111111"))) === null, "13. 当前账号需求草稿已清除");
  ok((await h(() => localStorage.getItem("outfitai.chat.messages:anonymous"))) !== null, "13. 其它身份的消息不受影响");

  // ---- StrictMode：全程无重复请求（12 次解析 = 12 次用户输入 / 选项操作，3 次确认）----
  const final = await calls();
  ok(final.analyze === 12 && final.validate === 3 && final.confirm === 3 && final.regenerate === 1, `StrictMode 下请求次数与操作一致 ${JSON.stringify(final)}`);
  ok(errors.length === 0, "全程无页面错误");
  console.log(`\nAll ${results.length} chat provider e2e checks passed.`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}
