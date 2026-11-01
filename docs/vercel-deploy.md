# Publicar el panel Valentino Motors en Vercel

Proyecto Supabase confirmado: `oficyvzpwpfjnajaqkrg`, URL `https://oficyvzpwpfjnajaqkrg.supabase.co`.
El repositorio GitHub es `brunnojuarez553-design/asistentevirtualvalentino`, rama de trabajo `feat/asistente-valentino`.

## 1. Vincular Vercel al código correcto

- En Vercel > proyecto existente > **Settings > Git**, confirmar que está conectado al repositorio exacto anterior, **Root Directory = raíz del repositorio**, y que el proyecto no usa un framework distinto a "Other" (el repositorio contiene `vercel.json` con `framework:null`).
- No cambiar por accidente otro sitio de Valentino que tenga la web pública.
- Mantener `main` como producción mientras esta rama se prueba en un **Preview Deployment**. GitHub PR #1 sigue en borrador.
- Node.js **24.x**, establecido en `package.json`. La función `api/index.mjs` recibe todas las rutas desde `vercel.json` y usa el servidor compartido sin abrir un puerto. `includeFiles` agrega HTML, CSS y el catálogo base.

## 2. Variables de entorno: Settings > Environment Variables

Cargar en **Preview** (primero) y más tarde también en **Production** cuando la prueba esté aprobada:

| Variable | Valor |
| --- | --- |
| `STORAGE` | `supabase` |
| `AUTH_MODE` | `supabase` |
| `SUPABASE_URL` | `https://oficyvzpwpfjnajaqkrg.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Copiar la clave pública de **Supabase > Project Settings > API Keys** |
| `SUPABASE_SERVICE_ROLE_KEY` | Copiar **secret key / service_role** desde Supabase, marcar **Sensitive**, solo entorno de servidor |
| `META_WEBHOOKS_ENABLED` | `false` |
| `AI_ENABLED` | `false` |
| `NODEJS_HELPERS` | `0` (preserva el cuerpo crudo para HMAC de futuros webhooks Meta) |

**NO** guardar estas claves en `vercel.json`, `.env.example` ni GitHub. No hace falta `DASHBOARD_TOKEN` con `AUTH_MODE=supabase`; tampoco configurar ninguna contraseña de Valentino como variable.

Al agregar/cambiar variables, hacer **Redeploy** del Preview.

## 3. Pruebas del Preview antes de producción

1. `GET /health` debe devolver `{"ok":true,"mode":"simulation","outbound":false}`.
2. `GET /auth/mode` debe devolver `{"mode":"supabase"}`.
3. La página `/` debe mostrar la pantalla **Valentino Motors · acceso privado**.
4. Abrir el panel e iniciar sesión desde su dispositivo; correo creado y confirmado en Supabase; contraseña que ya conoce, **rotarla por ser temporal**.
5. En **Servicios**, ver 11 servicios cargados desde `public.vm_services`.
6. Crear un servicio ficticio **sin aprobar**, subir una imagen comercial, editar la ficha y archivarlo. Verificar cambios en `vm_services` y Storage, y eliminar posteriormente los recursos de prueba con cuidado.
7. Confirmar que `GET /api/services` sin sesión devuelve 401, y que no aparece ninguna clave privada en la pestaña Network del navegador.
8. WhatsApp, Instagram y Meta deben seguir **desactivados**; ninguna respuesta se envía a clientes.

## 4. Limitaciones y siguientes tareas

- El panel maneja catálogo persistente directamente en `vm_services`. El simulador y configuración usan aún `assistant_workspace`, un documento JSON compartido con actualizaciones de lectura-escritura, no apto para alta concurrencia multicanal. Migrarlo a `vm_conversations`, `vm_messages` y eventos idempotentes antes de activar webhooks.
- Las reglas de cotización aún no están conectadas para precios automáticos; se requiere aprobación de condiciones exactas de vehículo y servicio.
- **No pasar a producción** hasta verificar el Preview real (la existencia del proyecto Vercel no demuestra que los cambios de esta rama estén publicados).
- **Coexistencia de WhatsApp Business App + Cloud API** es requisito obligatorio y debe estar validada por Meta antes de conectar el número actual de Valentino.

