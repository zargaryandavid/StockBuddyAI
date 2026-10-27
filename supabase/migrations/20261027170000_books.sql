-- The Education Library's book list, managed in Admin. Signed-in people can read it; only
-- the API's service role (Admin) can change it. Reviews now point at a real book, and
-- removing a book removes its ratings.
create table public.books (
  id text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null check (char_length(btrim(author)) between 1 and 200),
  isbn text check (isbn is null or isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'),
  amazon_url text check (amazon_url is null or (amazon_url ~ '^https://' and char_length(amazon_url) <= 500)),
  cover_url text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 500)),
  description text not null default '' check (char_length(description) <= 600),
  topic text not null default '' check (char_length(topic) <= 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_sort_order_idx on public.books (sort_order, title);

alter table public.books enable row level security;
revoke all on table public.books from anon, authenticated;
grant select on table public.books to authenticated;
grant select, insert, update, delete on table public.books to service_role;

create policy books_select_signed_in on public.books
for select to authenticated using (true);

-- The 15 books the Library started with, same ids so existing ratings keep matching.
insert into public.books (id, title, author, isbn, description, topic, sort_order) values
  ('simple-path-to-wealth', 'The Simple Path to Wealth', 'JL Collins', '1533667926', 'A plain-spoken case for spending less than you earn, avoiding debt, and putting the rest in a broad stock index fund.', 'Financial independence', 0),
  ('psychology-of-money', 'The Psychology of Money', 'Morgan Housel', '0857197681', 'Short stories showing that how we behave with money matters more than how much finance we know.', 'Money mindset', 1),
  ('little-book-common-sense-investing', 'The Little Book of Common Sense Investing', 'John C. Bogle', '1119404509', 'The founder of Vanguard explains why owning the whole market at low cost beats trying to outguess it.', 'Index investing', 2),
  ('intelligent-investor', 'The Intelligent Investor', 'Benjamin Graham', '0060555661', 'The classic guide to treating stocks as parts of real businesses and always keeping a margin of safety.', 'Value investing', 3),
  ('random-walk-down-wall-street', 'A Random Walk Down Wall Street', 'Burton G. Malkiel', '0393358380', 'A tour of market history and theory that ends with a practical, low-cost plan for ordinary investors.', 'Index investing', 4),
  ('bogleheads-guide-to-investing', 'The Bogleheads'' Guide to Investing', 'Taylor Larimore, Mel Lindauer and Michael LeBoeuf', '1118921283', 'A step-by-step handbook for building a simple, diversified portfolio and leaving it alone.', 'Index investing', 5),
  ('your-money-or-your-life', 'Your Money or Your Life', 'Vicki Robin and Joe Dominguez', '0143115766', 'A nine-step program for measuring what your spending really costs in hours of your life.', 'Financial independence', 6),
  ('millionaire-next-door', 'The Millionaire Next Door', 'Thomas J. Stanley and William D. Danko', '1589795474', 'Research on real American millionaires, who mostly live modestly and build wealth quietly over decades.', 'Money basics', 7),
  ('i-will-teach-you-to-be-rich', 'I Will Teach You to Be Rich', 'Ramit Sethi', '1523505745', 'A six-week plan to automate your saving and investing so you can spend guilt-free on what you love.', 'Money basics', 8),
  ('die-with-zero', 'Die With Zero', 'Bill Perkins', '0358099765', 'An argument for spending your money on experiences while you can enjoy them, not hoarding it forever.', 'Money mindset', 9),
  ('one-up-on-wall-street', 'One Up On Wall Street', 'Peter Lynch', '0743200403', 'A legendary fund manager shows how everyday observations can lead you to promising companies.', 'Stock picking', 10),
  ('common-stocks-uncommon-profits', 'Common Stocks and Uncommon Profits', 'Philip A. Fisher', '0471445509', 'Fifteen questions for finding outstanding growth companies worth holding for many years.', 'Stock picking', 11),
  ('security-analysis', 'Security Analysis', 'Benjamin Graham and David Dodd', '0071592539', 'The deep, technical textbook on valuing stocks and bonds from their financial statements.', 'Value investing', 12),
  ('rich-dad-poor-dad', 'Rich Dad Poor Dad', 'Robert T. Kiyosaki', '1612680194', 'A story-driven push to think about assets that earn income rather than a paycheck alone.', 'Money mindset', 13),
  ('richest-man-in-babylon', 'The Richest Man in Babylon', 'George S. Clason', '0451205367', 'Old-fashioned parables about paying yourself first and letting savings work for you.', 'Money basics', 14)
on conflict (id) do nothing;

-- Every earlier rating was for one of the books above; drop any stray row before linking.
delete from public.book_reviews where book_id not in (select id from public.books);
alter table public.book_reviews
  add constraint book_reviews_book_id_fkey
  foreign key (book_id) references public.books(id) on delete cascade;
