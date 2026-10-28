-- FasoFlow — schéma initial. Appliquer avec Supabase CLI après avoir relié le projet.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client','merchant','courier','admin')),
  full_name text not null default '',
  phone text,
  city text,
  avatar_url text,
  is_available boolean not null default false,
  delivery_zone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 2000),
  city text not null default '',
  logo_url text,
  cover_url text,
  status text not null default 'pending_review' check (status in ('pending_review','active','suspended','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shops_owner_idx on public.shops(owner_id);
create index if not exists shops_status_city_idx on public.shops(status, city);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  price_xof bigint not null check (price_xof >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  status text not null default 'pending_review' check (status in ('pending_review','active','rejected','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_shop_status_idx on public.products(shop_id, status);
create index if not exists products_category_status_idx on public.products(category_id, status);
create index if not exists products_created_idx on public.products(created_at desc);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);
create index if not exists favorites_user_idx on public.favorites(user_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','preparing','ready_for_delivery','in_delivery','delivered','cancelled','delivery_cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded')),
  subtotal_xof bigint not null check (subtotal_xof >= 0),
  total_xof bigint not null check (total_xof >= 0),
  delivery_address jsonb not null default '{}'::jsonb,
  customer_note text not null default '' check (char_length(customer_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_date_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_shop_date_idx on public.orders(shop_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  unit_price_xof bigint not null check (unit_price_xof >= 0),
  quantity integer not null check (quantity > 0),
  line_total_xof bigint not null check (line_total_xof >= 0),
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  shop_id uuid references public.shops(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_id is not null or order_id is not null)
);
create index if not exists conversations_product_idx on public.conversations(product_id);
create index if not exists conversations_order_idx on public.conversations(order_id);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(conversation_id, user_id)
);
create index if not exists conversation_participants_user_idx on public.conversation_participants(user_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_date_idx on public.messages(conversation_id, created_at);

create table if not exists public.price_offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  offered_by uuid not null references public.profiles(id) on delete restrict,
  amount_xof bigint not null check (amount_xof > 0),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists price_offers_conversation_idx on public.price_offers(conversation_id, created_at desc);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  courier_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','in_progress','delivered','cancelled')),
  fee_xof bigint check (fee_xof is null or fee_xof >= 0),
  pickup_zone text not null default '',
  dropoff_zone text not null default '',
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deliveries_open_idx on public.deliveries(status, created_at) where courier_id is null;
create index if not exists deliveries_courier_status_idx on public.deliveries(courier_id, status, created_at desc);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists reviews_shop_idx on public.reviews(shop_id, created_at desc);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('merchant','courier')),
  code text not null,
  name text not null,
  price_xof bigint not null check (price_xof >= 0),
  interval text not null default 'month' check (interval in ('month','year','none')),
  product_limit integer check (product_limit is null or product_limit >= 0),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(audience, code)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null default 'active' check (status in ('pending','active','expired','cancelled')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id, status, current_period_end desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid references public.plans(id) on delete restrict,
  provider text not null check (provider in ('saspay','manual')),
  status text not null default 'pending' check (status in ('creating','pending','paid','failed','cancelled','rejected')),
  amount_xof bigint not null check (amount_xof > 0),
  currency text not null default 'XOF' check (currency = 'XOF'),
  provider_session_id text unique,
  provider_transaction_id text,
  provider_reference text,
  checkout_url text,
  idempotency_key text unique,
  reference text,
  proof_url text,
  provider_data jsonb not null default '{}'::jsonb,
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_user_date_idx on public.payments(user_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status, created_at);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'saspay'),
  event_id text not null unique,
  payment_id uuid references public.payments(id) on delete set null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 1000),
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_date_idx on public.notifications(user_id, created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null check (target_type in ('profile','shop','product','order','message')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open','in_review','resolved','rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reports_status_date_idx on public.reports(status, created_at);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  subject text not null check (char_length(subject) between 2 and 160),
  message text not null check (char_length(message) between 5 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Triggers de mise à jour temporelle.
do $$
declare t text;
begin
  foreach t in array array['profiles','shops','products','orders','deliveries','plans','subscriptions','payments'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;
