do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promo_code'
      and column_name = 'duration_days'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promo_code'
      and column_name = 'duration_months'
  ) then
    alter table public.promo_code
      add column duration_months integer;

    update public.promo_code
    set duration_months = greatest(1, ceil(duration_days::numeric / 30)::integer);

    update public.promo_code
    set duration_months = 12
    where lower(btrim(promo_code)) = 'm5';

    alter table public.promo_code
      alter column duration_months set not null;

    alter table public.promo_code
      drop column duration_days;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promo_code'
      and column_name = 'duration_months'
  ) then
    alter table public.promo_code
      add column duration_months integer not null default 12
      check (duration_months > 0);
  end if;
end;
$$;

update public.promo_code
set duration_months = 12
where lower(btrim(promo_code)) = 'm5';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.promo_code'::regclass
      and conname = 'promo_code_duration_months_positive'
  ) then
    alter table public.promo_code
      add constraint promo_code_duration_months_positive
      check (duration_months > 0);
  end if;
end;
$$;

notify pgrst, 'reload schema';