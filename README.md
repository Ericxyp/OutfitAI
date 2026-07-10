# OutfitAI

OutfitAI 是一个 **AI 私人穿搭顾问** MVP。用户可以保存自己的衣服，在首页通过聊天描述穿搭需求，AI 根据衣橱中的结构化数据生成中文穿搭建议。

> **LLM 说明：** MVP 使用 [Qwen3-VL-Plus](https://help.aliyun.com/zh/model-studio/)（DashScope OpenAI 兼容 API）进行衣服图片识别与穿搭推荐。所有 AI 调用均在服务端执行。

---

## MVP 功能

| 模块 | 功能 |
|------|------|
| 登录 | Supabase Auth 邮箱 Magic Link 登录 |
| 衣橱 | 上传衣服图片、AI 识别属性、分类筛选、详情与删除 |
| 首页 Chatbox | 输入穿搭需求，AI 从衣橱中选品生成推荐；支持基于定位和天气的智能推荐 |
| 旅行规划 | `/travel` 多日穿搭计划 + 打包清单，结合天气预报与风格画像 |
| 购物助手 | `/shopping` 上传商品图，分析是否值得买、可搭配套数与组合方案 |
| 推荐反馈 | 喜欢 / 不太合适 / 收藏，沉淀为基础风格画像 |
| 我的 | 衣橱 / 收藏 / 喜欢统计，风格画像，收藏列表 |
| 收藏页 | 查看已保存的穿搭推荐 |

---

## 技术栈

- **框架：** Next.js 15（App Router）+ TypeScript
- **样式：** Tailwind CSS v4
- **后端：** Supabase（Auth、Postgres、Storage）
- **AI：** Qwen3-VL-Plus（DashScope OpenAI 兼容 API，通过 `openai` SDK 调用）
- **部署：** 支持 Vercel 等 Node 环境

---

## 环境变量配置

复制示例文件并填入实际值：

```bash
cp .env.local.example .env.local
```

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名公钥 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端密钥（可选，管理任务用） |
| `NEXT_PUBLIC_SITE_URL` | 本地 `http://localhost:3000`，生产环境改为正式域名 |
| `QWEN_API_KEY` | 阿里云 DashScope API Key |
| `QWEN_BASE_URL` | 兼容模式 Base URL，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | 模型名，默认 `qwen3-vl-plus` |
| `WEATHER_API_KEY` | 天气 API Key（服务端调用，用于定位天气推荐） |
| `WEATHER_API_BASE_URL` | 天气 API Base URL，默认 `https://api.weatherapi.com/v1` |
| `NEXT_PUBLIC_APP_NAME` | 应用名称，默认 `OutfitAI` |

---

## Supabase 配置步骤

### 1. 创建项目

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 新建项目，记录 **Project URL** 和 **API Keys**

### 2. 执行数据库 Schema

在 **SQL Editor** 中执行：

```
supabase/schema.sql
```

将创建：

- `profiles`、`closet_items`、`outfit_recommendations`、`feedback`、`user_style_profiles`、`travel_plans`、`travel_plan_days`、`shopping_checks` 表
- Row Level Security 策略
- Storage bucket `closet`（衣服图片）
- 新用户自动创建 profile 的 Trigger

### 3. 配置 Auth

1. **Authentication → Providers → Email**：开启 Email 登录，开发阶段建议关闭 **Confirm email**
2. **Authentication → URL Configuration**：
   - Site URL：`http://localhost:3000`
   - Redirect URLs：`http://localhost:3000/auth/callback`
3. **Authentication → Email Templates → Magic Link**（必改，否则 Sign in 链接容易 PKCE 失败）：
   ```html
   <h2>登录 OutfitAI</h2>
   <p>点击下方按钮登录，链接仅可使用一次。</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">Sign in</a></p>
   ```
   使用 `token_hash` 直链后，点击邮件 Sign in 可在任意浏览器完成登录，不依赖 PKCE。

### 4. （可选）导入 Demo 数据

先在本应用完成一次登录注册，然后在 SQL Editor 执行 `supabase/seed.sql`（需将脚本中的 `demo_user_id` 替换为你的用户 UUID）。详见 [Demo 数据](#demo-数据可选)。

---

## Qwen / DashScope 配置步骤

1. 前往 [阿里云百炼 / DashScope](https://dashscope.console.aliyun.com/) 创建 API Key
2. 将 Key 填入 `.env.local` 的 `QWEN_API_KEY`
3. 使用默认配置即可：

```bash
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3-vl-plus
```

4. 验证连接：

```bash
npm run test:qwen
```

5. 修改 `.env.local` 后需 **重启** `npm run dev`

API Key **仅存在于服务端**，不会暴露到浏览器。

---

## 天气推荐能力

首页支持**基于定位和天气**的穿搭推荐：

1. 用户点击「使用当前位置」，浏览器 Geolocation API 获取经纬度（需用户主动授权）
2. 服务端根据经纬度调用天气 API（`lib/weather.ts`），获取温度、天气、湿度、风速等
3. AI 推荐时会结合天气上下文和规则提示，在推荐理由中解释天气适配原因
4. 天气信息会保存到 `outfit_recommendations.model_output.weather`

**降级策略：**
- 用户拒绝定位 → 正常推荐，不使用天气
- 未配置 `WEATHER_API_KEY` → 正常推荐
- 天气 API 失败或超时 → 正常推荐，不向用户报错

**隐私说明：**
- 浏览器定位仅用于本次推荐请求
- `WEATHER_API_KEY` 只在服务端使用，不会暴露到客户端

### 天气 API 配置（可选）

默认适配 [WeatherAPI.com](https://www.weatherapi.com/)：

```bash
WEATHER_API_KEY=你的天气 API Key
WEATHER_API_BASE_URL=https://api.weatherapi.com/v1
```

更换供应商时，修改 `lib/weather.ts` 中的 `normalizeWeatherApiResponse()` 字段映射即可。

---

## Memory 系统（风格画像）

OutfitAI 会根据你的反馈逐步学习风格偏好：

| 反馈 | 影响 |
|------|------|
| 喜欢 / 收藏 | 更新 `preferred_styles`、`preferred_colors`、`preferred_occasions`、`favorite_item_ids` |
| 不太合适 | 更新 `avoid_styles`、`avoid_colors`、`disliked_item_ids` |

- 数据保存在 Supabase 表 `user_style_profiles`
- 后续穿搭推荐会在 AI prompt 中注入「用户风格画像」
- 「我的」页面可查看当前风格画像
- `/profile/style` 可查看完整风格画像，并重新生成 AI 风格总结
- Memory 更新失败不会影响反馈提交

在 Supabase SQL Editor 执行 `supabase/schema.sql` 后会创建 `user_style_profiles` 表（含 RLS）。

### 风格画像页面 `/profile/style`

登录后访问 **我的 → 穿搭偏好**，或直达 `/profile/style`：

- 展示常用风格、偏好颜色、常用场景、不喜欢元素
- 统计最常出现在推荐中的 Top 5 单品
- 显示 AI 生成的个人风格总结（基于真实反馈数据，服务端调用 Qwen）
- 支持「重新生成我的风格总结」

风格总结生成逻辑读取 `user_style_profiles`、`feedback`、`outfit_recommendations`、`closet_items`，`QWEN_API_KEY` 仅在服务端使用。

### 旅行穿搭规划 `/travel`

登录后从 **我的 → 旅行穿搭规划** 进入，或访问 `/travel`：

- 输入目的地、出发日期、天数（1-10）、旅行目的、风格偏好
- 可选「尽量少带衣服」，AI 会规划复用策略
- 结合 **天气预报**（`getForecastByDestination`）+ 衣橱 + 风格画像生成 Day1-DayN 穿搭
- 输出打包清单（上装/下装/外套/鞋子/配饰）
- 计划保存到 `travel_plans` 和 `travel_plan_days`

**降级策略：**
- 天气 API 失败 → 仍生成旅行计划，不阻断
- 衣橱不足（<3 件）→ 提示去添加衣服

### 购物搭配助手 `/shopping`

登录后从 **我的 → 购物搭配助手** 进入，或访问 `/shopping`：

- **第一版仅支持商品图片上传**，不支持淘宝/小红书/京东等商品链接
- 上传想购买的商品图片（JPG / PNG / WebP，最大 5MB）
- 可选填写商品名称、价格、品牌、链接备注、你的问题
- 服务端调用 **Qwen Vision** 识别商品属性（类别、颜色、风格、材质、季节、版型）
- 结合衣橱 + 风格画像输出：
  - 推荐指数（0-100）
  - 预计可搭配套数
  - 推荐购买：buy（推荐购买）/ consider（谨慎考虑）/ skip（不建议购买）
  - 原因、风险、可搭配组合
- 分析记录保存到 `shopping_checks` 表
- 商品图片上传到 Storage `closet` bucket 的 `{user_id}/shopping/` 路径

**降级策略：**
- 风格画像读取失败 → 不阻断分析
- Qwen 或识别失败 → 友好错误提示

---

## 本地运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)，建议用 Chrome DevTools 切换到 iPhone 视口（375px）体验移动端 UI。

```bash
# 生产构建验证
npm run build
npm start
```

---

## Demo 演示流程

完整演示约 **3 分钟**，路径如下：

| 步骤 | 页面 | 操作 |
|------|------|------|
| 1 | `/login` | 输入邮箱 → 获取登录链接 → 邮件中点击登录 |
| 2 | `/closet` | 点击「添加」→ 上传 3 件衣服（名称 + 分类即可） |
| 3 | `/` | 点击快捷提问如「约会想温柔一点」，或输入自定义需求 |
| 4 | 首页推荐卡片 | 查看 AI 搭配结果 → 点击「收藏」 |
| 5 | `/profile` | 查看统计 →「收藏的穿搭」确认已保存 |

也可访问 **`/demo`** 查看应用内演示指南。

### 快捷 Demo（使用 Seed 数据）

若已执行 `seed.sql`，登录对应账号后衣橱已有 5 件示例衣服，可直接从步骤 3 开始演示 AI 推荐。

---

## Demo 数据（可选）

文件：`supabase/seed.sql`

包含：

- 5 条 `closet_items` 示例（placeholder 图片 URL）
- 2 条 `outfit_recommendations` 示例
- 1 条 `feedback`（收藏）示例

**使用步骤：**

1. 先在应用中用邮箱登录一次（创建 `auth.users` 记录）
2. 在 Supabase SQL Editor 查询你的用户 ID：

```sql
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
```

3. 打开 `supabase/seed.sql`，将 `REPLACE_WITH_YOUR_USER_ID` 替换为上述 UUID
4. 在 SQL Editor 执行整个脚本

---

## 项目结构（简要）

```
app/                  # 页面路由
  page.tsx            # 首页 Chatbox
  closet/             # 衣橱
  profile/            # 我的
  saved/              # 收藏
  demo/               # 演示指南
components/           # UI 组件
lib/
  ai/                 # Qwen 调用（穿搭推荐 + 图片识别）
  actions/            # Server Actions
  supabase/           # Supabase 客户端
supabase/
  schema.sql          # 数据库 Schema
  seed.sql            # Demo 种子数据
```

---

## 当前不做的功能

以下能力**不在 MVP 范围内**，后续迭代再考虑：

- **Multi-Agent** — 多 Agent 协作编排
- **RAG** — 检索增强生成
- **Vector Database** — 向量数据库 / 语义检索
- **复杂 Memory** — 长期记忆与用户偏好学习
- **复杂推荐系统** — 协同过滤、排序模型等

---

## 常见问题

**Q：AI 推荐提示衣橱不够？**  
需要至少 3 件 `status = ready` 的衣服。去衣橱页添加，或执行 `seed.sql`。

**Q：Magic Link 登录失败？**  
检查 Supabase Redirect URLs 是否包含 `http://localhost:3000/auth/callback`。

**Q：图片上传失败？**  
确认已执行 `schema.sql` 中的 Storage bucket `closet` 及 RLS 策略。

**Q：Qwen 调用失败或超时？**  
检查 `QWEN_API_KEY` 是否有效、DashScope 余额/配额是否充足，并运行 `npm run test:qwen` 排查。修改环境变量后需重启 `npm run dev`。

---

## License

Private MVP — 仅供演示与内部开发使用。
