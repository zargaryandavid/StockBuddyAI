-- The Amazon Associates tag added to the Library's "Buy on Amazon" links; empty means
-- plain links without a tag.
alter table public.app_settings
  add column amazon_affiliate_tag text not null default ''
    check (amazon_affiliate_tag ~ '^[A-Za-z0-9-]{0,64}$');
