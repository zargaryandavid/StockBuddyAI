-- Share links can also show the Today page: net worth, FIRE progress, cash, a heat map
-- of all holdings, today's moves, and the net worth history. Like the FIRE link, it
-- belongs to the person, not to one portfolio, and each person has at most one.
alter table public.share_links
  drop constraint if exists share_links_kind_check,
  drop constraint if exists share_links_check;

alter table public.share_links
  add constraint share_links_kind_check check (kind in ('fire', 'portfolio', 'today')),
  add constraint share_links_portfolio_check check (kind in ('fire', 'today') or portfolio_id is not null);

create unique index share_links_one_today on public.share_links (user_id) where kind = 'today';
