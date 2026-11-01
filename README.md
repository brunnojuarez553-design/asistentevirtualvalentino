# Valentino Motors LG · Asistente multicanal

Panel de control para Valentino Motors, con catálogo comercial editable, bandeja de simulación para WhatsApp/Instagram y preparación para integraciones oficiales de Meta. **Aún no se envían mensajes reales** a WhatsApp, DMs ni comentarios de Instagram.

- **Repo:** `brunnojuarez553-design/asistentevirtualvalentino`
- **Rama en pruebas:** `feat/asistente-valentino`, PR #1 en borrador; la rama `main` conserva el relevamiento original
- **Supabase:** `oficyvzpwpfjnajaqkrg` · 15 tablas protegidas con RLS · 11 servicios de referencia · bucket `valentino-service-images`
- **Vercel:** `api/index.mjs` contiene el adaptador al runtime Node 24; `vercel.json` configura rutas y archivos. Vercel informa build exitoso de la rama; **todavía no hemos verificado la URL de Preview en el navegador ni un inicio de sesión real**.
- **Acceso:** Supabase Auth con comprobación de `vm_staff`; cuenta de Valentino creada, correo confirmado y rol `owner` asignado. Ninguna contraseña se guarda en código.

## Lo que funciona

**Servicios:** en el panel hay buscador, alta, edición y archivo de servicios. Permite nombre, descripción, categorías, inclusiones, compatibilidad, garantía, texto comercial, precio de referencia e imagen por URL HTTPS o subida JPG/PNG/WebP hasta 5 MB. Los precios de referencia **no se usan para cotizar** sin reglas de servicio+vehículo exactas, vigentes y aprobadas en `vm_price_rules`.

**Bandeja:** prueba conversaciones de WhatsApp, Instagram DM y comentarios sin contactar clientes reales. Los turnos pasan a intervención humana, solo Valentino confirma citas. Los comentarios de Instagram se moderan, nunca se publican solos. El asistente evita saludos repetidos.

**IA:** la lógica de reglas funciona sin modelo. Opcionalmente se generan **borradores** con Groq u OpenAI (desactivados por defecto, requieren aprobación humana).

**Seguridad:** backend conserva claves privadas, sesiones Supabase se validan en cada `/api/*`, el rol `owner/admin` es obligatorio para modificar servicios o configurar la IA, el panel bloquea el acceso sin sesión, tablas RLS sin acceso directo público a datos personales, imagen de servicios pública solo para material comercial.

## Despliegue

Seguir [docs/vercel-deploy.md](docs/vercel-deploy.md) para verificar repositorio/branch y configurar las variables **en Vercel**, nunca en GitHub.

Variables de Vercel requeridas:
- `STORAGE=supabase`
- `AUTH_MODE=supabase`
- `SUPABASE_URL=https://oficyvzpwpfjnajaqkrg.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` (clave pública de Supabase)
- `SUPABASE_SERVICE_ROLE_KEY` (secreto **exclusivo del backend**)
- `AI_ENABLED=false`
- `META_WEBHOOKS_ENABLED=false`
- `NODEJS_HELPERS=0` (preservar la firma HMAC de futuras notificaciones Meta)

`NODE_ENV=production` y `SERVERLESS=true` quedan impuestos por la Vercel Function. La función falla cerrada cuando faltan credenciales. No es necesario `DASHBOARD_TOKEN` para usar Auth en producción.

`vercel.json` reenvía rutas del panel a `api/index.mjs` mediante el parámetro interno `vm_route`; el handler sirve HTML/CSS/JS desde archivos empaquetados, endpoints privados y un `GET /health` de diagnóstico.

**Preflight obligatorio:** en Preview comprobar `/health`, `/auth/mode`, login real, 11 servicios, edición y carga de foto con usuario autorizado, acceso 401 sin sesión y que WhatsApp/Instagram continúen desactivados. No activar producción hasta verificar el Preview.

## Desarrollo local y pruebas

Requiere Node 24. Sin dependencias externas de terceros:

```sh
npm start
npm test
```

Por defecto escucha en loopback `http://127.0.0.1:3000`. El modo local utiliza `STORAGE=local` con workspace aislado en `.data` (ignorado por Git). Para pruebas que requieren Supabase, configurar secretos solo en variables del entorno privado.

GitHub Actions ejecuta validación sintáctica y `node --test`. Incluye pruebas de autenticación, permisos, catálogo, imágenes, rutas de Vercel, firma de Meta, turnos y simulación.

La encuesta original se conserva en `index.html` y se muestra bajo `/relevamiento`. No trasladar información privada del formulario a archivos públicos.

## Pendientes para producción

1. **Verificar el Preview de Vercel y registrar la URL real**; configurar variables secretas desde la interfaz Vercel, hacer Redeploy, comprobar login de Valentino y rotar contraseña temporal compartida anteriormente.
2. Migrar conversaciones de `assistant_workspace` (JSON central) a `vm_conversations`/`vm_messages` transaccionales con idempotencia y soporte de múltiples instancias. **Aunque el catálogo ya usa `vm_services`, el motor de conversaciones actual no está preparado para producción multicanal concurrente.**
3. Agregar auditoría de cambios por usuario, límites de acceso, retención, backups y recuperación.
4. Aprobar compatibilidad y tarifas de cada servicio antes de presupuestos automáticos.
5. Configurar Meta Business/Instagram; **la coexistencia de WhatsApp Business App + Cloud API con el mismo número es requisito obligatorio de lanzamiento**. No realizar migración convencional del número ni habilitar envíos hasta validar elegibilidad, Embedded Signup y pruebas de toma de control humano.

Para detalles de autorización de cuentas, ver [docs/acceso-valentino.md](docs/acceso-valentino.md). Para esquema y ampliaciones de tablas, ver `db/`.

## Importante

- Ningún token, contraseña ni clave privada de Supabase o Meta en GitHub, frontend o logs.
- El bucket de imágenes es público **solo para material comercial autorizado**; no subir fotografías personales ni documentación de clientes.
- `META_WEBHOOKS_ENABLED=false` hasta contar con aprobación del cliente y permisos oficiales.
