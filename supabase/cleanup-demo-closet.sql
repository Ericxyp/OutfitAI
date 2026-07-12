-- OutfitAI Cleanup: 删除误导入的 demo 衣橱占位数据
-- 默认只查询，不删除任何数据。
-- 使用前把 your@email.com 替换成你的登录邮箱。
-- 第一步：运行 SELECT，确认结果是 demo 占位衣服。
-- 第二步：确认无误后，手动取消 DELETE 段落注释再执行。

select
  ci.id,
  ci.name,
  ci.category,
  ci.image_url,
  u.email
from public.closet_items ci
join auth.users u on u.id = ci.user_id
where u.email = 'your@email.com'
  and ci.image_url like 'https://placehold.co/%text=OutfitAI%';

-- 确认上面查出来的是 demo 占位衣服后，再手动取消下方注释执行：
--
-- delete from public.closet_items ci
-- using auth.users u
-- where ci.user_id = u.id
--   and u.email = 'your@email.com'
--   and ci.image_url like 'https://placehold.co/%text=OutfitAI%'
-- returning ci.id, ci.name, ci.category, ci.image_url;

-- 默认运行本文件不会删除任何数据。
