-- Safely link legacy Supabase reservations to one uniquely matching, verified phone account.
-- Existing customer_id values and all reservation fields/statuses are left unchanged.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.reservation_customer_link_issues (
  reservation_id uuid primary key,
  customer_phone text not null,
  normalized_phone text,
  matching_accounts integer not null,
  verified_matching_accounts integer not null,
  reason text not null check (
    reason in (
      'invalid_or_unsupported_phone',
      'no_matching_account',
      'phone_not_verified',
      'multiple_matching_accounts'
    )
  ),
  recorded_at timestamptz not null default now()
);

alter table private.reservation_customer_link_issues enable row level security;
revoke all on private.reservation_customer_link_issues from public, anon, authenticated;

-- A phone match is safe only when exactly one Auth account has it and that phone is verified.
with account_phone_counts as (
  select
    public.normalize_salvadoran_phone(auth_user.phone) as normalized_phone,
    count(*)::integer as matching_accounts,
    (count(*) filter (where auth_user.phone_confirmed_at is not null))::integer
      as verified_matching_accounts,
    min(auth_user.id::text)::uuid as user_id
  from auth.users as auth_user
  where auth_user.phone is not null
    and public.normalize_salvadoran_phone(auth_user.phone) is not null
  group by public.normalize_salvadoran_phone(auth_user.phone)
),
unique_verified_accounts as (
  select normalized_phone, user_id
  from account_phone_counts
  where matching_accounts = 1
    and verified_matching_accounts = 1
)
update public.reservations as reservation
set customer_id = account.user_id
from unique_verified_accounts as account
where reservation.customer_id is null
  and public.normalize_salvadoran_phone(reservation.customer_phone) = account.normalized_phone;

-- Keep a private, queryable report of every still-unlinked reservation.
with reservation_phones as (
  select
    reservation.id as reservation_id,
    reservation.customer_phone,
    public.normalize_salvadoran_phone(reservation.customer_phone) as normalized_phone
  from public.reservations as reservation
  where reservation.customer_id is null
),
account_phone_counts as (
  select
    public.normalize_salvadoran_phone(auth_user.phone) as normalized_phone,
    count(*)::integer as matching_accounts,
    (count(*) filter (where auth_user.phone_confirmed_at is not null))::integer
      as verified_matching_accounts
  from auth.users as auth_user
  where auth_user.phone is not null
    and public.normalize_salvadoran_phone(auth_user.phone) is not null
  group by public.normalize_salvadoran_phone(auth_user.phone)
)
insert into private.reservation_customer_link_issues (
  reservation_id,
  customer_phone,
  normalized_phone,
  matching_accounts,
  verified_matching_accounts,
  reason
)
select
  reservation.reservation_id,
  reservation.customer_phone,
  reservation.normalized_phone,
  coalesce(account.matching_accounts, 0),
  coalesce(account.verified_matching_accounts, 0),
  case
    when reservation.normalized_phone is null then 'invalid_or_unsupported_phone'
    when coalesce(account.matching_accounts, 0) = 0 then 'no_matching_account'
    when account.matching_accounts > 1 then 'multiple_matching_accounts'
    when account.verified_matching_accounts = 0 then 'phone_not_verified'
  end
from reservation_phones as reservation
left join account_phone_counts as account
  on account.normalized_phone = reservation.normalized_phone
on conflict (reservation_id) do update
set
  customer_phone = excluded.customer_phone,
  normalized_phone = excluded.normalized_phone,
  matching_accounts = excluded.matching_accounts,
  verified_matching_accounts = excluded.verified_matching_accounts,
  reason = excluded.reason,
  recorded_at = now();

delete from private.reservation_customer_link_issues as issue
using public.reservations as reservation
where reservation.id = issue.reservation_id
  and reservation.customer_id is not null;

commit;
