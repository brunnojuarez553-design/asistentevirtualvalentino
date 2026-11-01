-- Ejecutado sobre oficyvzpwpfjnajaqkrg.
-- Se mantiene compatibilidad con el esquema inicial.
alter table public.vm_services
  add column if not exists category text not null default 'General',
  add column if not exists inclusions text,
  add column if not exists compatibility text,
  add column if not exists image_url text;
alter table public.vm_services
  add constraint vm_services_category_length check (char_length(category) between 1 and 80);
alter table public.vm_services
  add constraint vm_services_image_https check (image_url is null or (length(image_url) <= 2048 and image_url ~ '^https://[^[:space:]]+$'));
create index if not exists vm_services_catalog_by_business
  on public.vm_services(business_id,active,approved,name);
comment on column public.vm_services.approved is 'Contenido general revisado. NO habilita cotizar sin reglas exactas aprobadas.';
comment on column public.vm_services.reference_price_usd is 'Valor orientativo interno, no autorizado automáticamente para cotizaciones.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('valentino-service-images','valentino-service-images',true,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- El servidor utiliza credencial privada. No se habilitan permisos de subida para anon/authenticated.
