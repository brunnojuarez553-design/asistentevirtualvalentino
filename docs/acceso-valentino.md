# Dar de alta el acceso privado de Valentino Motors

Proyecto Supabase: `oficyvzpwpfjnajaqkrg`.
La cuenta de acceso debe crearse mediante **Supabase Authentication**, nunca insertando manualmente filas en `auth.users` o guardando contraseñas en el repositorio.

## Creación inicial de cuenta
1. [Authentication > Users](https://supabase.com/dashboard/project/oficyvzpwpfjnajaqkrg/auth/users).
2. **Add user** → **Send invitation** (recomendado). El destinatario define una contraseña segura desde su propio correo. Si se usa **Create new user** con contraseña temporal, exigir cambio al primer acceso.
3. Tras confirmar el email, asociar el `auth.users.id` a `public.vm_staff` con rol `owner`.

## SQL para autorizar al titular una vez creado y confirmado el usuario

```sql
insert into public.vm_staff (business_id,user_id,role,active)
select b.id,u.id,'owner',true
from public.vm_businesses b
join auth.users u on lower(u.email)=lower('EMAIL_CONFIRMADO_DE_VALENTINO')
where b.slug='valentino-motors'
  and u.email_confirmed_at is not null
on conflict (business_id,user_id)
do update set role='owner',active=true;
```

Verificación de estado:

```sql
select u.email,s.role,s.active
from public.vm_staff s
join auth.users u on u.id=s.user_id
join public.vm_businesses b on b.id=s.business_id
where b.slug='valentino-motors';
```

## Requisitos del panel
- El módulo `lib/panel-auth.mjs` está conectado al servidor: `POST /auth/login` autentica contra Supabase Auth y `GET /api/*` valida token de sesión y pertenencia activa a `vm_staff`. El panel incluye pantalla de login y cierre de sesión; no existe sesión persistente en el navegador.
- La cuenta de Valentino ya fue creada, confirmada y asignada como `owner` en `vm_staff`. El modo de producción requiere `AUTH_MODE=supabase` y `STORAGE=supabase`. La clave service_role permanece sólo en el backend; ver [vercel-deploy.md](vercel-deploy.md).
- No conectar Meta ni hacer envíos reales hasta terminar autenticación, despliegue, permisos y pruebas de coexistencia.
- Nunca registrar ni replicar la contraseña temporal del cliente en commits, issues, README, logs o variables visibles.
