-- ============================================================================
-- AURELIS OS — Notion as a briefing delivery channel
--
-- A briefing written into a Notion database is a delivery like any other, and
-- the rule for deliveries is that every one leaves a row saying what happened.
-- Silence is ambiguous: "the page never appeared" could be an unconfigured
-- database, a revoked token, a Notion outage, or a bug, and only the log tells
-- them apart. So the channel joins the check constraint rather than being
-- logged somewhere else.
-- ============================================================================

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
  check (channel in ('in_app', 'email', 'slack', 'notion'));
