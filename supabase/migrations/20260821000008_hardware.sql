-- Phase E — Hardware feature flag.
-- OrgSettings.hardwareEnabled is the app-side flag that gates Web Serial hardware
-- (printer, cash drawer, scale). The app loads it from the settings row via
-- settingsFrom() (settings.hardware_enabled), so the persisted column lives on
-- public.settings — not public.organizations — which the app does not currently
-- load. NOT pushed yet: coordinator applies after Phase A migration 0005 lands.
-- Idempotent for safe re-runs.

alter table public.settings
  add column if not exists hardware_enabled boolean not null default false;
