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
]
