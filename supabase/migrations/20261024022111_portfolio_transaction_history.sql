create table public.portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.-]{1,12}$'),
  kind text not null check (kind in ('buy', 'sell')),
  quantity integer not null check (quantity > 0),
  price numeric(18, 6) not null check (price >= 0),
  transacted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index portfolio_transactions_portfolio_date_idx
  on public.portfolio_transactions (portfolio_id, transacted_at desc, created_at desc);

alter table public.portfolio_transactions enable row level security;

revoke all on table public.portfolio_transactions from anon, authenticated;
grant select, insert on table public.portfolio_transactions to authenticated;

create policy portfolio_transactions_select_own
on public.portfolio_transactions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy portfolio_transactions_insert_own
on public.portfolio_transactions
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_transactions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create function public.apply_portfolio_transaction(
  target_portfolio_id uuid,
  transaction_ticker text,
  transaction_kind text,
  transaction_quantity integer,
  transaction_price numeric,
  transaction_transacted_at timestamptz default now()
)
returns setof public.portfolio_transactions
language plpgsql
set search_path = ''
as $$
declare
  normalized_ticker text := upper(trim(transaction_ticker));
  owner_id uuid;
  held_quantity integer;
  held_purchase_price numeric;
  recorded public.portfolio_transactions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if normalized_ticker !~ '^[A-Z0-9.-]{1,12}$' then
    raise exception 'invalid ticker';
  end if;
  if transaction_kind not in ('buy', 'sell') then
    raise exception 'invalid transaction kind';
  end if;
  if transaction_quantity <= 0 then
    raise exception 'transaction quantity must be positive';
  end if;
  if transaction_price < 0 then
    raise exception 'transaction price cannot be negative';
  end if;

  select user_id
  into owner_id
  from public.portfolios
  where id = target_portfolio_id
    and user_id = (select auth.uid())
  for update;

  if owner_id is null then
    raise exception 'portfolio not found';
  end if;

  select shares, purchase_price
  into held_quantity, held_purchase_price
  from public.portfolio_positions
  where portfolio_id = target_portfolio_id
    and ticker = normalized_ticker
  for update;

  if transaction_kind = 'sell' then
    if held_quantity is null then
      raise exception 'cannot sell a position not held';
    end if;
    if transaction_quantity > held_quantity then
      raise exception 'sale exceeds the held quantity';
    end if;

    if transaction_quantity = held_quantity then
      delete from public.portfolio_positions
      where portfolio_id = target_portfolio_id
        and ticker = normalized_ticker;
    else
      update public.portfolio_positions
      set shares = held_quantity - transaction_quantity
      where portfolio_id = target_portfolio_id
        and ticker = normalized_ticker;
    end if;
  elsif held_quantity is null then
    insert into public.portfolio_positions (
      portfolio_id,
      ticker,
      shares,
      purchase_price,
      display_order
    )
    values (
      target_portfolio_id,
      normalized_ticker,
      transaction_quantity,
      transaction_price,
      coalesce(
        (
          select max(display_order) + 1
          from public.portfolio_positions
          where portfolio_id = target_portfolio_id
        ),
        0
      )
    );
  else
    update public.portfolio_positions
    set
      shares = held_quantity + transaction_quantity,
      purchase_price = (
        held_quantity * coalesce(held_purchase_price, 0)
        + transaction_quantity * transaction_price
      ) / (held_quantity + transaction_quantity)
    where portfolio_id = target_portfolio_id
      and ticker = normalized_ticker;
  end if;

  insert into public.portfolio_transactions (
    portfolio_id,
    user_id,
    ticker,
    kind,
    quantity,
    price,
    transacted_at
  )
  values (
    target_portfolio_id,
    owner_id,
    normalized_ticker,
    transaction_kind,
    transaction_quantity,
    transaction_price,
    transaction_transacted_at
  )
  returning * into recorded;

  return next recorded;
end;
$$;

revoke all on function public.apply_portfolio_transaction(
  uuid, text, text, integer, numeric, timestamptz
) from public, anon;
grant execute on function public.apply_portfolio_transaction(
  uuid, text, text, integer, numeric, timestamptz
) to authenticated;
