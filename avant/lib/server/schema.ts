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
  {
    id: 6,
    name: 'push notifications on the iOS app',
    sql: `
      -- One row per device that asked for notifications. The token is
      -- Apple's and identifies an install, not a person. It belongs to the
      -- sign-in session that registered it, so signing out, signing out
      -- everywhere, a password change, session expiry and closing the
      -- account all remove it; so does Apple saying it's gone.
      create table push_devices (
        token text primary key,
        user_id text not null references users(id) on delete cascade,
        session_hash text not null references sessions(token_hash) on delete cascade,
        platform text not null check (platform in ('ios')),
        created_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now()
      );
      create index push_devices_user on push_devices(user_id);
      -- Each notification is pushed once, like the email outbox.
      alter table notifications add column pushed_at timestamptz;
    `,
  },
  {
    id: 7,
    name: 'trip records and claims',
    sql: `
      -- The record insurers and state car-sharing laws expect for every
      -- trip: odometer and fuel at pickup and at return, who entered them,
      -- when, and whether the other person confirmed them.
      create table trip_logs (
        booking_id text not null references bookings(id) on delete cascade,
        kind text not null check (kind in ('pickup', 'return')),
        odometer integer not null,
        fuel_pct integer not null,
        recorded_by text not null references users(id),
        recorded_at timestamptz not null default now(),
        confirmed_by text references users(id),
        confirmed_at timestamptz,
        primary key (booking_id, kind)
      );

      -- Damage and other charges a host reports, and accidents or breakdowns
      -- a guest reports. Words are sealed like messages. Kept after an account
      -- closes: they are the evidence for insurance and disputes.
      create table claims (
        id text primary key,
        booking_id text not null references bookings(id) on delete cascade,
        opened_by text not null references users(id),
        role text not null check (role in ('host', 'guest')),
        kind text not null,
        description text not null,
        amount_cents integer,
        photo_ids text[] not null default '{}',
        police_report text,
        other_party text,
        status text not null default 'open' check (status in ('open', 'responded', 'review', 'withdrawn', 'resolved')),
        respond_by timestamptz,
        response text,
        response_accepts boolean,
        responded_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index claims_booking on claims(booking_id);
      create index claims_status on claims(status, respond_by);

      alter table photos drop constraint photos_kind_check;
      alter table photos add constraint photos_kind_check check (kind in ('listing', 'avatar', 'claim'));

      -- One push device per sign-in session.
      delete from push_devices p using push_devices q where p.session_hash = q.session_hash and p.last_seen_at < q.last_seen_at;
      create unique index push_devices_session on push_devices(session_hash);

      -- What people want to hear about, by email and by push. Trip, payment,
      -- claim and security notices always go; messages and offers (price
      -- drops, Circle and referral news, review reminders) can be turned off.
      alter table notifications add column category text not null default 'trips' check (category in ('trips', 'messages', 'offers'));
      alter table users add column notify_prefs jsonb not null default '{}';

      -- Members can block each other and report people, messages and reviews.
      create table user_blocks (
        blocker_id text not null references users(id) on delete cascade,
        blocked_id text not null references users(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (blocker_id, blocked_id)
      );
      create table reports (
        id text primary key,
        reporter_id text not null references users(id),
        subject_user_id text not null references users(id),
        context text not null check (context in ('profile', 'message', 'review', 'listing', 'trip')),
        subject_id text,
        reason text not null,
        details text not null default '',
        status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
        created_at timestamptz not null default now()
      );
      create index reports_status on reports(status, created_at);

      -- Accepting an updated document from the in-app prompt.
      alter table consents drop constraint consents_context_check;
      alter table consents add constraint consents_context_check check (context in ('signup', 'booking', 'listing', 'update'));

      -- Changing the email address: the new address must confirm first.
      create table email_changes (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        new_email text not null,
        expires_at timestamptz not null
      );
    `,
  },
]
