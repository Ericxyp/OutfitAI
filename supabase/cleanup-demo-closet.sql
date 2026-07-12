-- OutfitAI Cleanup: 删除误导入的 demo 衣橱占位数据
-- ============================================================
-- 使用前把 your@email.com 替换成你的登录邮箱
-- 务必先跑 SELECT 确认，再执行 DELETE
-- ============================================================

-- 使用前把 your@email.com 替换成你的登录邮箱
select ci.id, ci.name, ci.category, ci.image_url
from public.closet_items ci
join auth.users u on u.id = ci.user_id
where u.email = 'your@email.com'
  and ci.image_url like 'https://placehold.co/%text=OutfitAI%';

-- 确认上面查出来的是 demo 占位衣服后，再执行 delete
delete from public.closet_items ci
using auth.users u
where ci.user_id = u.id
  and u.email = 'your@email.com'
  and ci.image_url like 'https://placehold.co/%text=OutfitAI%'
returning ci.id, ci.name;
