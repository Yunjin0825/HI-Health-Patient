alter table public.registrations
  add column if not exists "tshirtSize" text,
  add column if not exists "shoePrefs" text,
  add column if not exists "shoeRequestNote" text,
  add column if not exists "cgmParticipation" boolean,
  add column if not exists "familyGender" text,
  add column if not exists "familyAge" text,
  add column if not exists "familyShoeSize" text,
  add column if not exists "familyMemo" text,
  add column if not exists "familyMembers" jsonb,
  add column if not exists "cruiseParticipation" boolean,
  add column if not exists "eventParticipation" boolean,
  add column if not exists "note" text,
  add column if not exists "adminNote" text;
