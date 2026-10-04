/**
 * Database schema as ordered migrations. Each runs once, inside a
 * transaction, and is recorded in schema_migrations. Never edit a shipped
 * migration; add a new one.
 */

export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'core',
    sql: `
      create table users (
        id text primary key,
        email text not null unique,
        name text not null,
        password_hash text not null,
        bio text not null default '',
        avatar_photo_id text,
        created_at timestamptz not null default now()
      );

      -- Only a SHA-256 of each session token is stored, so a database leak
      -- does not hand out live sessions.
      create table sessions (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
      create index sessions_user on sessions(user_id);

      create table photos (
        id text primary key,
        owner_id text not null references users(id) on delete cascade,
        kind text not null check (kind in ('listing', 'avatar')),
        listing_id text,
        angle text,
        mime text not null,
        width integer not null,
        height integer not null,
        sha256 text not null,
        bytes bytea not null,
        created_at timestamptz not null default now()
      );
      create index photos_listing on photos(listing_id);

      create table listings (
        id text primary key,
        slug text not null unique,
        host_id text not null references users(id) on delete cascade,
        status text not null check (status in ('live', 'paused')),
        city text not null,
        daily_rate_cents integer not null,
        data jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index listings_host on listings(host_id);
      create index listings_city on listings(city) where status = 'live';

      create table bookings (
        id text primary key,
        listing_slug text not null,
        guest_id text not null references users(id),
        host_id text references users(id),
        start_date date not null,
        end_date date not null,
        status text not null check (status in ('pending_payment', 'requested', 'confirmed', 'declined', 'cancelled')),
        paid text not null check (paid in ('demo', 'stripe')),
        payment_ref text,
        request jsonb not null,
        quote jsonb not null,
        car jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index bookings_listing on bookings(listing_slug, start_date, end_date);
      create index bookings_guest on bookings(guest_id);
      create index bookings_host on bookings(host_id);

      create table threads (
        id text primary key,
        booking_id text not null unique references bookings(id) on delete cascade,
        guest_id text not null references users(id),
        host_id text not null references users(id),
        last_message_at timestamptz not null default now()
      );

      create table messages (
        id text primary key,
        thread_id text not null references threads(id) on delete cascade,
        sender_id text not null references users(id),
        body text not null,
        created_at timestamptz not null default now()
      );
      create index messages_thread on messages(thread_id, created_at);

      create table thread_reads (
        thread_id text not null references threads(id) on delete cascade,
        user_id text not null references users(id) on delete cascade,
        read_at timestamptz not null,
        primary key (thread_id, user_id)
      );

      create table notifications (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        title text not null,
        body text not null,
        href text not null,
        created_at timestamptz not null default now(),
        read_at timestamptz
      );
      create index notifications_user on notifications(user_id, created_at desc);

      create table favorites (
        user_id text not null references users(id) on delete cascade,
        listing_slug text not null,
        created_at timestamptz not null default now(),
        primary key (user_id, listing_slug)
      );
    `,
  },
  {
    id: 2,
    name: 'driver records',
    sql: `
      -- Sealed (AES-256-GCM) Driver Pass records, used when no vault service
      -- is configured. The database only ever sees ciphertext.
      create table driver_records (
        key text primary key,
        sealed text not null check (sealed like 'v1.%'),
        updated_at timestamptz not null default now()
      );
    `,
  },
  {
    id: 3,
    name: 'payments, hosting, reviews, recovery',
    sql: `
      -- Refunds. refund_status: none (nothing owed), pending (owed, not yet
      -- confirmed by Stripe), done, or demo (preview mode, no money moved).
      alter table bookings add column refund_cents integer not null default 0;
      alter table bookings add column refund_status text not null default 'none' check (refund_status in ('none', 'pending', 'done', 'demo'));
      alter table bookings add column refund_ref text;
      alter table bookings add column cancelled_by text check (cancelled_by in ('guest', 'host', 'system'));
      alter table bookings drop constraint bookings_status_check;
      alter table bookings add constraint bookings_status_check check (status in ('pending_payment', 'requested', 'confirmed', 'declined', 'cancelled', 'expired'));

      -- Host payouts through Stripe Connect (Express accounts).
      alter table users add column stripe_account_id text;
      alter table users add column payouts_enabled boolean not null default false;
      alter table users add column deleted_at timestamptz;

      create table payouts (
        booking_id text primary key references bookings(id),
        host_id text not null references users(id),
        amount_cents integer not null check (amount_cents >= 0),
        status text not null check (status in ('pending', 'paid')),
        transfer_id text,
        created_at timestamptz not null default now(),
        paid_at timestamptz
      );
      create index payouts_host on payouts(host_id);

      -- Days a host has taken off the calendar.
      create table listing_blocks (
        id text primary key,
        listing_id text not null references listings(id) on delete cascade,
        start_date date not null,
        end_date date not null check (end_date >= start_date),
        created_at timestamptz not null default now()
      );
      create index listing_blocks_listing on listing_blocks(listing_id, start_date);

      -- One review per person per trip: the guest reviews the car and host,
      -- the host reviews the guest.
      create table reviews (
        id text primary key,
        booking_id text not null references bookings(id) on delete cascade,
        author_id text not null references users(id),
        subject text not null check (subject in ('car', 'guest')),
        subject_user_id text not null references users(id),
        listing_slug text not null,
        rating integer not null check (rating between 1 and 5),
        body text not null,
        created_at timestamptz not null default now(),
        unique (booking_id, author_id)
      );
      create index reviews_listing on reviews(listing_slug, created_at desc) where subject = 'car';
      create index reviews_subject on reviews(subject_user_id);

      -- Password reset links: only a SHA-256 of each token is stored.
      create table password_resets (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        used_at timestamptz
      );

      -- Notification emails go out from this table (an outbox).
      alter table notifications add column emailed_at timestamptz;
    `,
  },
  {
    id: 4,
    name: 'advantage: credit, referrals, nudges',
    sql: `
      -- AVANT credit, as a ledger: the balance is the sum. Credit pays for
      -- trips only and is never exchanged for cash.
      create table credits (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        amount_cents integer not null check (amount_cents <> 0),
        reason text not null check (reason in ('promise_host_cancel', 'promise_request_expired', 'referral_welcome', 'referral_reward', 'used', 'returned', 'goodwill')),
        booking_id text,
        created_at timestamptz not null default now()
      );
      create index credits_user on credits(user_id, created_at desc);
      -- Each kind of credit at most once per trip, so retries never pay twice.
      create unique index credits_once on credits(user_id, reason, booking_id) where booking_id is not null;

      alter table bookings add column credit_cents integer not null default 0 check (credit_cents >= 0);
      alter table bookings add column refund_credit_cents integer not null default 0 check (refund_credit_cents >= 0);
      alter table bookings add column nudged_at timestamptz;

      alter table users add column referral_code text unique;
      alter table users add column referred_by text references users(id);
      alter table users add column referral_rewarded boolean not null default false;
    `,
  },
  {
    id: 5,
    name: 'hardening: shared limits, consent records',
    sql: `
      -- Rate limits shared by every server instance. Keys are SHA-256
      -- hashes, so no email address or IP is stored here.
      create table rate_limits (
        key_hash text primary key,
        tokens double precision not null,
        updated timestamptz not null default now()
      );

      -- Proof of agreement: which version of which document each person
      -- accepted, when, and in what context. Never edited, only added to.
      create table consents (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        document text not null check (document in ('terms', 'privacy', 'trip_terms', 'host_agreement')),
        version text not null,
        context text not null check (context in ('signup', 'booking', 'listing')),
        subject_id text,
        accepted_at timestamptz not null default now()
      );
      create index consents_user on consents(user_id, accepted_at desc);

      -- Email verification. Accounts that existed before this migration were
      -- created before verification existed; they are treated as verified.
      alter table users add column email_verified_at timestamptz;
      update users set email_verified_at = created_at;
      create table email_verifications (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null
      );

      -- Sessions end after 14 idle days, not only at 30.
      alter table sessions add column last_seen_at timestamptz not null default now();

      -- Money retries: a payout or refund is claimed ('sending') before Stripe
      -- is called, and failures are counted and rotate to the back.
      alter table payouts drop constraint payouts_status_check;
      alter table payouts add constraint payouts_status_check check (status in ('pending', 'sending', 'paid'));
      alter table payouts add column attempts integer not null default 0;
      alter table payouts add column last_attempt_at timestamptz;
      alter table payouts add column last_error text;
      alter table bookings add column refund_attempts integer not null default 0;
      alter table bookings add column refund_error text;
    `,
  },
]
