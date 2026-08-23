-- W4.2 — eligibility adapter stub: insurance card photo on the customer profile.
-- Stored as a resized JPEG data-URL (same pattern as Rx hard-copy scans).
alter table public.customers
  add column if not exists insurance_card_image text;
