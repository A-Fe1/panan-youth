-- ============================================================
-- 磐城遇见 · 数据库初始化脚本（v2 修正版）
-- 使用方法：登录 Supabase → SQL Editor → 粘贴本文件全部内容 → Run
-- 支持重复执行：即使之前跑失败过，直接重新粘贴运行即可。
-- ============================================================

-- ---------- 1. 资料卡表（公开资料） ----------
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null default '',
  gender      text not null default '',
  age         int,
  hometown    text not null default '',
  work_place  text not null default '',
  mbti        text not null default '',
  constellation text not null default '',
  bio         text not null default '',
  hobbies     jsonb not null default '[]',   -- 兴趣爱好标签数组
  avatar_path text not null default '',      -- 证件照（封面形象照）
  life_photos jsonb not null default '[]',   -- 生活照（最多3张）
  daily_photos jsonb not null default '[]',  -- 我想分享的照片（最多6张）
  status      text not null default 'active', -- active 正常 / banned 已封禁
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable"
  on public.profiles for select to authenticated
  using (status = 'active' or user_id = auth.uid());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (user_id = auth.uid());

-- ---------- 2. 打招呼记录表（先建，微信表要引用它） ----------
create table if not exists public.greetings (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  message    text not null default '',
  status     text not null default 'pending', -- pending 待回应 / matched 已成为朋友 / declined 已婉拒
  created_at timestamptz not null default now()
);

alter table public.greetings enable row level security;

drop policy if exists "greetings visible to parties" on public.greetings;
create policy "greetings visible to parties"
  on public.greetings for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "greetings send as self" on public.greetings;
create policy "greetings send as self"
  on public.greetings for insert to authenticated
  with check (from_id = auth.uid());

drop policy if exists "greetings respond as recipient" on public.greetings;
create policy "greetings respond as recipient"
  on public.greetings for update to authenticated
  using (to_id = auth.uid())
  with check (to_id = auth.uid());

-- ---------- 3. 微信联系方式表（敏感，默认锁死） ----------
create table if not exists public.contacts (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  wechat   text not null default ''
);

alter table public.contacts enable row level security;

drop policy if exists "contacts own" on public.contacts;
create policy "contacts own"
  on public.contacts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 仅当两人已互相回应成为朋友，才能看到对方微信
drop policy if exists "contacts for matched friends" on public.contacts;
create policy "contacts for matched friends"
  on public.contacts for select to authenticated
  using (
    exists (
      select 1 from public.greetings g
      where g.status = 'matched'
        and (
          (g.from_id = user_id and g.to_id = auth.uid())
          or (g.to_id = user_id and g.from_id = auth.uid())
        )
    )
  );

-- ---------- 4. 密保表（忘记密码时验证身份用） ----------
create table if not exists public.secqa (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  phone_hash   text not null unique,  -- 手机号的加盐慢哈希（不存明文手机号）
  question     text not null,
  answer_hash  text not null,
  created_at   timestamptz not null default now()
);

alter table public.secqa enable row level security;

-- 未登录状态可按手机号哈希查询密保问题（忘记密码流程用）
drop policy if exists "secqa readable" on public.secqa;
create policy "secqa readable"
  on public.secqa for select to anon, authenticated
  using (true);

-- 登录用户写入自己的密保
drop policy if exists "secqa insert own" on public.secqa;
create policy "secqa insert own"
  on public.secqa for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- 5. 举报表 ----------
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_id   uuid not null references auth.users(id) on delete cascade,
  reason      text not null default '',
  handled     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.reports enable row level security;

-- 登录用户可提交举报
drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- 只能看自己提交的举报（管理员用管理后台查看全部）
drop policy if exists "reports view own" on public.reports;
create policy "reports view own"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

-- ---------- 6. 照片存储桶 ----------
-- 公开可读的照片桶
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- 登录用户只能上传到自己名下的文件夹（文件夹名 = 用户ID）
drop policy if exists "photos upload own folder" on storage.objects;
create policy "photos upload own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 照片公开可读（资料卡展示需要）
drop policy if exists "photos public read" on storage.objects;
create policy "photos public read"
  on storage.objects for select
  using (bucket_id = 'photos');

-- 只能删除自己文件夹里的照片
drop policy if exists "photos delete own" on storage.objects;
create policy "photos delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 7. 自动维护 updated_at ----------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 执行完成！表格：profiles / greetings / contacts / secqa / reports
-- 存储桶：photos
-- ============================================================
