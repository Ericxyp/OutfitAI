-- OutfitAI Product Recommendations Seed
-- ============================================================
-- 导入购物推荐示例商品（无需 user_id，可直接在 SQL Editor 运行）
-- 前置：已执行 supabase/schema.sql（或 migrations/20260712_product_recommendations.sql）
-- 用途：让购物助手结果页能展示商品推荐卡片与「去购买」按钮
-- ============================================================

insert into public.product_recommendations (
  id,
  title,
  brand,
  category,
  color,
  style_tags,
  occasion_tags,
  price_min,
  price_max,
  image_url,
  product_url,
  merchant,
  commission_type,
  is_active
)
values
  (
    'c3000003-0003-4000-8000-000000000001',
    '白色基础 T 恤',
    'MUJI',
    '上衣',
    '白色',
    array['简约', '休闲'],
    array['日常', '周末'],
    79,
    129,
    null,
    'https://example.com/product/white-tee',
    'MUJI 官方',
    'demo',
    true
  ),
  (
    'c3000003-0003-4000-8000-000000000002',
    '米白休闲长裤',
    'Uniqlo',
    '裤子',
    '米白',
    array['简约', '通勤'],
    array['上班', '日常'],
    199,
    299,
    'https://placehold.co/400x533/e8e4df/111111/png?text=Pants',
    'https://example.com/product/off-white-pants',
    'Uniqlo 官方',
    'demo',
    true
  ),
  (
    'c3000003-0003-4000-8000-000000000003',
    '黑色乐福鞋',
    'Clarks',
    '鞋子',
    '黑色',
    array['通勤', '正式'],
    array['上班', '聚会'],
    399,
    599,
    'https://placehold.co/400x533/e8e4df/111111/png?text=Loafers',
    'https://example.com/product/black-loafers',
    'Clarks 官方',
    'demo',
    true
  ),
  (
    'c3000003-0003-4000-8000-000000000004',
    '轻薄防晒外套',
    'Decathlon',
    '外套',
    '浅灰',
    array['休闲', '简约'],
    array['旅行', '周末'],
    149,
    249,
    'https://placehold.co/400x533/e8e4df/111111/png?text=Jacket',
    'https://example.com/product/light-jacket',
    'Decathlon 官方',
    'demo',
    true
  ),
  (
    'c3000003-0003-4000-8000-000000000005',
    '简约帆布包',
    'Baggu',
    '包',
    '藏青',
    array['简约', '休闲'],
    array['日常', '旅行'],
    89,
    159,
    null,
    'https://example.com/product/canvas-tote',
    'Baggu 官方',
    'demo',
    true
  )
on conflict (id) do update set
  title = excluded.title,
  brand = excluded.brand,
  category = excluded.category,
  color = excluded.color,
  style_tags = excluded.style_tags,
  occasion_tags = excluded.occasion_tags,
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  image_url = excluded.image_url,
  product_url = excluded.product_url,
  merchant = excluded.merchant,
  commission_type = excluded.commission_type,
  is_active = excluded.is_active;
