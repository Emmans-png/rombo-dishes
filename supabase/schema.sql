-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_rombo_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;
revoke all on function public.is_rombo_admin() from public;
grant execute on function public.is_rombo_admin() to authenticated;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  price_kes numeric(10,2) not null check (price_kes > 0),
  image_url text not null default '',
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  phone text not null check (char_length(phone) between 7 and 20),
  fulfilment text not null check (fulfilment in ('pickup','delivery')),
  delivery_address text not null default '',
  payment_method text not null check (payment_method in ('cash_or_mpesa_on_collection','online_mpesa')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  order_status text not null default 'received' check (order_status in ('received','confirmed','preparing','ready','out_for_delivery','completed','cancelled')),
  notes text not null default '' check (char_length(notes) <= 500),
  total_kes numeric(10,2) not null check (total_kes > 0),
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists tracking_update text not null default ''
  check (char_length(tracking_update) <= 500);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  unit_price_kes numeric(10,2) not null check (unit_price_kes > 0),
  quantity integer not null check (quantity between 1 and 50),
  line_total_kes numeric(10,2) not null check (line_total_kes > 0)
);

alter table public.admin_users enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Admins can read own admin record" on public.admin_users;
create policy "Admins can read own admin record" on public.admin_users for select to authenticated using (user_id = auth.uid());

drop policy if exists "Public can read available menu" on public.menu_items;
create policy "Public can read available menu" on public.menu_items for select to anon, authenticated using (is_available = true or public.is_rombo_admin());
drop policy if exists "Admins manage menu" on public.menu_items;
create policy "Admins manage menu" on public.menu_items for all to authenticated using (public.is_rombo_admin()) with check (public.is_rombo_admin());
drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders" on public.orders for select to authenticated using (public.is_rombo_admin());
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders for update to authenticated using (public.is_rombo_admin()) with check (public.is_rombo_admin());
drop policy if exists "Admins read order items" on public.order_items;
create policy "Admins read order items" on public.order_items for select to authenticated using (public.is_rombo_admin());
-- Orders are created only by the place-order Edge Function using server-side service-role access.
-- Do not add public INSERT policies on orders/order_items.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view menu images" on storage.objects;
create policy "Public can view menu images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "Admins upload menu images" on storage.objects;
create policy "Admins upload menu images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_rombo_admin());

drop policy if exists "Admins update menu images" on storage.objects;
create policy "Admins update menu images"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.is_rombo_admin())
  with check (bucket_id = 'menu-images' and public.is_rombo_admin());

drop policy if exists "Admins delete menu images" on storage.objects;
create policy "Admins delete menu images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_rombo_admin());
