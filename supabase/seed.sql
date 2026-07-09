-- OutfitAI Demo Seed Data
-- ============================================================
-- 使用前：
-- 1. 确保已执行 supabase/schema.sql
-- 2. 在应用中完成一次邮箱登录（创建 auth.users）
-- 3. 查询用户 ID：
--      SELECT id, email FROM auth.users ORDER BY created_at DESC;
-- 4. 将下方 v_user_id 替换为你的 UUID，然后在 SQL Editor 执行本脚本
-- ============================================================

DO $$
DECLARE
  -- ⚠️ 将下方字符串替换为你的 auth.users.id（UUID 格式）
  v_user_id_text text := 'REPLACE_WITH_YOUR_USER_ID';
  v_user_id uuid;

  -- 固定 UUID，方便重复执行时 upsert
  v_item_top    uuid := 'a1000001-0001-4000-8000-000000000001';
  v_item_pants  uuid := 'a1000001-0001-4000-8000-000000000002';
  v_item_coat   uuid := 'a1000001-0001-4000-8000-000000000003';
  v_item_shoes  uuid := 'a1000001-0001-4000-8000-000000000004';
  v_item_bag    uuid := 'a1000001-0001-4000-8000-000000000005';

  v_rec_date    uuid := 'b2000002-0002-4000-8000-000000000001';
  v_rec_work    uuid := 'b2000002-0002-4000-8000-000000000002';

  v_placeholder text := 'https://placehold.co/400x533/e8e4df/111111/png?text=OutfitAI';
BEGIN
  IF v_user_id_text = 'REPLACE_WITH_YOUR_USER_ID' THEN
    RAISE EXCEPTION '请先将 v_user_id_text 替换为你的 auth.users.id';
  END IF;

  v_user_id := v_user_id_text::uuid;

  -- 确保 profile 存在
  INSERT INTO public.profiles (id, email, display_name)
  SELECT v_user_id, u.email, split_part(u.email, '@', 1)
  FROM auth.users u
  WHERE u.id = v_user_id
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- closet_items 示例（5 件，满足 AI 推荐最低要求）
  -- ============================================================
  INSERT INTO public.closet_items (
    id, user_id, image_url, name, category, color, material,
    style_tags, season_tags, occasion_tags, notes, status
  ) VALUES
  (
    v_item_top, v_user_id,
    v_placeholder || '+Top',
    '米白宽松衬衫', '上衣', '米白', '棉',
    ARRAY['简约', '通勤', '温柔'],
    ARRAY['春', '秋'],
    ARRAY['上班', '约会', '日常'],
    '偏宽松，适合塞进下装或单穿',
    'ready'
  ),
  (
    v_item_pants, v_user_id,
    v_placeholder || '+Pants',
    '高腰直筒牛仔裤', '裤子', '浅蓝', '牛仔',
    ARRAY['休闲', '韩系'],
    ARRAY['春', '夏', '秋'],
    ARRAY['周末', '日常', '约会'],
    '高腰版型，显腿长',
    'ready'
  ),
  (
    v_item_coat, v_user_id,
    v_placeholder || '+Coat',
    '卡其风衣', '外套', '卡其', '聚酯纤维',
    ARRAY['通勤', '正式', '简约'],
    ARRAY['春', '秋'],
    ARRAY['上班', '旅行'],
    '经典版型，适合叠穿',
    'ready'
  ),
  (
    v_item_shoes, v_user_id,
    v_placeholder || '+Shoes',
    '白色小白鞋', '鞋子', '白色', '皮革',
    ARRAY['休闲', '简约'],
    ARRAY['春', '夏', '秋', '冬'],
    ARRAY['日常', '周末', '上班'],
    '百搭款，干净感',
    'ready'
  ),
  (
    v_item_bag, v_user_id,
    v_placeholder || '+Bag',
    '黑色托特包', '包', '黑色', 'PU',
    ARRAY['通勤', '简约'],
    ARRAY['春', '夏', '秋', '冬'],
    ARRAY['上班', '日常'],
    '能装 laptop，通勤实用',
    'ready'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    color = EXCLUDED.color,
    material = EXCLUDED.material,
    style_tags = EXCLUDED.style_tags,
    season_tags = EXCLUDED.season_tags,
    occasion_tags = EXCLUDED.occasion_tags,
    notes = EXCLUDED.notes,
    image_url = EXCLUDED.image_url,
    updated_at = now();

  -- ============================================================
  -- outfit_recommendations 示例
  -- ============================================================
  INSERT INTO public.outfit_recommendations (
    id, user_id, request_text, title, selected_item_ids,
    summary, reasoning, style_tags, occasion, model_output
  ) VALUES
  (
    v_rec_date, v_user_id,
    '明天约会，想穿得温柔一点',
    '温柔约会通勤风',
    ARRAY[v_item_top, v_item_pants, v_item_shoes, v_item_bag],
    '米白衬衫搭配浅蓝牛仔裤，再用小白鞋提亮整体。托特包增加日常精致感，温柔又不刻意。',
    '衬衫的米白色和宽松版型传达温柔气质；牛仔裤平衡了正式感，小白鞋让整体更轻盈，适合约会晚餐或咖啡约会。',
    ARRAY['温柔', '简约', '韩系'],
    '约会',
    '{"alternatives": ["若天气凉，可叠加卡其风衣", "想更正式可把牛仔裤换成深色直筒裤"], "source": "seed"}'::jsonb
  ),
  (
    v_rec_work, v_user_id,
    '今天上班，不想太正式',
    '轻松通勤 Look',
    ARRAY[v_item_top, v_item_pants, v_item_coat, v_item_shoes],
    '衬衫 + 牛仔裤是基础，外搭卡其风衣提升层次。小白鞋代替皮鞋，保留专业感又不过于严肃。',
    '风衣提供通勤需要的结构感，但牛仔裤和小白鞋降低了正式度，符合「不想太正式」的需求。',
    ARRAY['通勤', '休闲', '简约'],
    '上班',
    '{"alternatives": ["去掉风衣会更休闲", "换深色包增加稳重感"], "source": "seed"}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    reasoning = EXCLUDED.reasoning,
    style_tags = EXCLUDED.style_tags,
    occasion = EXCLUDED.occasion,
    selected_item_ids = EXCLUDED.selected_item_ids,
    model_output = EXCLUDED.model_output;

  -- feedback 示例（收藏第一条推荐，可重复执行）
  DELETE FROM public.feedback
  WHERE user_id = v_user_id
    AND recommendation_id = v_rec_date;

  INSERT INTO public.feedback (user_id, recommendation_id, rating)
  VALUES (v_user_id, v_rec_date, 'save');

  RAISE NOTICE 'Demo 数据已导入：5 件衣服，2 条推荐，1 条收藏';
END $$;

-- ============================================================
-- 数据结构参考（供开发查阅）
-- ============================================================
--
-- closet_items 示例字段：
-- {
--   "id": "uuid",
--   "user_id": "uuid",
--   "image_url": "https://placehold.co/400x533/...",
--   "name": "米白宽松衬衫",
--   "category": "上衣",
--   "color": "米白",
--   "material": "棉",
--   "style_tags": ["简约", "通勤", "温柔"],
--   "season_tags": ["春", "秋"],
--   "occasion_tags": ["上班", "约会", "日常"],
--   "notes": "偏宽松，适合塞进下装或单穿",
--   "status": "ready"
-- }
--
-- outfit_recommendations 示例字段：
-- {
--   "id": "uuid",
--   "user_id": "uuid",
--   "request_text": "明天约会，想穿得温柔一点",
--   "title": "温柔约会通勤风",
--   "selected_item_ids": ["uuid", "uuid", ...],
--   "summary": "搭配说明...",
--   "reasoning": "推荐理由...",
--   "style_tags": ["温柔", "简约"],
--   "occasion": "约会",
--   "model_output": { "alternatives": [...], "source": "seed" }
-- }
