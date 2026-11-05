-- Edit and remove recorded transactions. By default the holdings follow: removing a buy takes
-- its shares back out (and its cost out of the average), removing a sell puts its shares back,
-- and an edit is undoing the old trade and applying the new one. With adjust_holdings = false
-- only the history changes (for trades that were never reflected in the holdings).

grant update, delete on table public.portfolio_transactions to authenticated;

create policy portfolio_transactions_update_own
on public.portfolio_transactions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy portfolio_transactions_delete_own
on public.portfolio_transactions
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Moves one trade's effect on a holding in or out. direction = 1 applies it, -1 undoes it.
create function public.shift_portfolio_holding(
  target_portfolio_id uuid,
  holding_ticker text,
  trade_kind text,
  trade_quantity integer,
  trade_price numeric,
  direction integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  held_quantity integer;
  held_price numeric;
  -- A buy applied or a sell undone adds shares; a sell applied or a buy undone removes them.
  adding boolean := (trade_kind = 'buy') = (direction = 1);
  remaining integer;
begin
  select shares, purchase_price
  into held_quantity, held_price
  from public.portfolio_positions
  where portfolio_id = target_portfolio_id
    and ticker = holding_ticker
  for update;

  if adding then
    if held_quantity is null then
      insert into public.portfolio_positions (portfolio_id, ticker, shares, purchase_price, display_order)
      values (
        target_portfolio_id,
        holding_ticker,
        trade_quantity,
        trade_price,
        coalesce(
          (select max(display_order) + 1 from public.portfolio_positions where portfolio_id = target_portfolio_id),
          0
        )
      );
    else
      update public.portfolio_positions
      set
        shares = held_quantity + trade_quantity,
        -- A buy raises or lowers the average cost; a sell put back keeps it.
        purchase_price = case
          when trade_kind = 'buy' then
            (held_quantity * coalesce(held_price, trade_price) + trade_quantity * trade_price)
            / (held_quantity + trade_quantity)
          else held_price
        end
      where portfolio_id = target_portfolio_id
        and ticker = holding_ticker;
    end if;
  else
    if held_quantity is null or held_quantity < trade_quantity then
      raise exception 'holdings have fewer % shares than this change needs', holding_ticker;
    end if;
    remaining := held_quantity - trade_quantity;
    if remaining = 0 then
      delete from public.portfolio_positions
      where portfolio_id = target_portfolio_id
        and ticker = holding_ticker;
    else
      update public.portfolio_positions
      set
        shares = remaining,
        -- Taking a buy back out takes its cost out of the average too.
        purchase_price = case
          when trade_kind = 'buy' and held_price is not null
            and (held_price * held_quantity - trade_price * trade_quantity) / remaining > 0
          then (held_price * held_quantity - trade_price * trade_quantity) / remaining
          else held_price
        end
      where portfolio_id = target_portfolio_id
        and ticker = holding_ticker;
    end if;
  end if;
end;
$$;

-- Runs as the caller (row-level security applies), so the two functions below can use it.
revoke all on function public.shift_portfolio_holding(uuid, text, text, integer, numeric, integer)
from public, anon;
grant execute on function public.shift_portfolio_holding(uuid, text, text, integer, numeric, integer)
to authenticated;

create function public.remove_portfolio_transaction(
  target_transaction_id uuid,
  adjust_holdings boolean default true
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  old_row public.portfolio_transactions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select * into old_row
  from public.portfolio_transactions
  where id = target_transaction_id
    and user_id = (select auth.uid())
  for update;
  if old_row.id is null then
    raise exception 'transaction not found';
  end if;
  if adjust_holdings then
    perform public.shift_portfolio_holding(
      old_row.portfolio_id, old_row.ticker, old_row.kind, old_row.quantity, old_row.price, -1
    );
  end if;
  delete from public.portfolio_transactions where id = target_transaction_id;
end;
$$;

create function public.edit_portfolio_transaction(
  target_transaction_id uuid,
  new_ticker text,
  new_kind text,
  new_quantity integer,
  new_price numeric,
  new_transacted_at timestamptz,
  adjust_holdings boolean default true
)
returns setof public.portfolio_transactions
language plpgsql
set search_path = ''
as $$
declare
  old_row public.portfolio_transactions;
  ticker_value text := upper(trim(new_ticker));
  saved public.portfolio_transactions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if ticker_value !~ '^[A-Z0-9.-]{1,12}$' then
    raise exception 'invalid ticker';
  end if;
  if new_kind not in ('buy', 'sell') then
    raise exception 'invalid transaction kind';
  end if;
  if new_quantity <= 0 then
    raise exception 'transaction quantity must be positive';
  end if;
  if new_price < 0 then
    raise exception 'transaction price cannot be negative';
  end if;
  select * into old_row
  from public.portfolio_transactions
  where id = target_transaction_id
    and user_id = (select auth.uid())
  for update;
  if old_row.id is null then
    raise exception 'transaction not found';
  end if;
  if adjust_holdings then
    perform public.shift_portfolio_holding(
      old_row.portfolio_id, old_row.ticker, old_row.kind, old_row.quantity, old_row.price, -1
    );
    perform public.shift_portfolio_holding(
      old_row.portfolio_id, ticker_value, new_kind, new_quantity, new_price, 1
    );
  end if;
  update public.portfolio_transactions
  set ticker = ticker_value,
      kind = new_kind,
      quantity = new_quantity,
      price = new_price,
      transacted_at = new_transacted_at
  where id = target_transaction_id
  returning * into saved;
  return next saved;
end;
$$;

revoke all on function public.remove_portfolio_transaction(uuid, boolean) from public, anon;
grant execute on function public.remove_portfolio_transaction(uuid, boolean) to authenticated;
revoke all on function public.edit_portfolio_transaction(uuid, text, text, integer, numeric, timestamptz, boolean)
from public, anon;
grant execute on function public.edit_portfolio_transaction(uuid, text, text, integer, numeric, timestamptz, boolean)
to authenticated;
