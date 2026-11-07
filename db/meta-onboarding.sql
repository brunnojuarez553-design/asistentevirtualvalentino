-- Run before enabling META_ONBOARDING_ENABLED.
-- A WhatsApp phone ID can belong to only one Austral company.
create unique index if not exists vm_meta_integrations_phone_unique
on public.vm_integrations ((config->>'phoneId'))
where provider='meta' and config ? 'phoneId';
