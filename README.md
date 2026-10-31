# Valentino Motors — asistente en preparación

Primera versión funcional, sin n8n. **Modo simulación exclusivo: no existe transporte de salida hacia Meta.** No se conectaron cuentas ni números. El catálogo incorpora ahora los 10 servicios y precios de referencia que compartió Valentino, pero **ninguno habilita cotizaciones automáticas** hasta ser aprobado y configurado con vehículo, motor, año, vigencia y revisión de cumplimiento legal.

## Probar ahora

Node 24 o superior, sin dependencias externas:

```sh
npm start
npm test
```

Abrir http://127.0.0.1:3000. El panel permite simular consultas, cambiar entre IA/revisión/humano, guardar respuestas aprobadas, revisar alertas y editar catálogo/tono. Datos locales en `.data/` (ignorado por Git). La clave del panel se ingresa por sesión y no se guarda en el navegador. Sin clave el servidor acepta solamente loopback; configurar clave incluso en equipos compartidos.

`index.html` conserva el relevamiento original y su endpoint Formspree `https://formspree.io/f/mgaoblgl`. Se accede en `/relevamiento`. No se envió el formulario durante desarrollo. Formspree sirve para recibir el relevamiento, no para almacenar conversaciones ni ejecutar IA. Su contenido guardado en otro navegador o enviado por correo no está disponible automáticamente en este repositorio.

## Catálogo y cotizaciones

Editar Catálogo y tono en el panel. Saludo/estilo/ejemplos son provisionales hasta recibir mensajes reales anonimizados. El catálogo inicial contiene referencias proporcionadas por Valentino: packs Toyota Dynamic Force (convencional e híbrido), Toyota 2GR-FKS fases 1 y 2, entonaciones Dynamic Force y 1GR-FE, Oil Catch Can, pack Suzuki Swift, y transmisiones Toyota UA80E/K320. Se guardan como `referencePriceUsd` con `approved:false` y `prices:[]`. **No son precios automáticos**. Esquema de un servicio de **prueba**, no una tarifa autorizada:

```json
{"id":"ejemplo","name":"Servicio de prueba","approved":false,"description":"Completar con Valentino","prices":[{"make":"Toyota","model":"Hilux","year":"2020","engine":"2.8","amount":100,"currency":"USD","validUntil":"2026-12-31","conditions":"Solo ejemplo; no utilizar comercialmente","approved":false}]}
```

El motor exige servicio y precio aprobados, importe positivo, moneda ISO de tres letras, vencimiento vigente y coincidencia exacta de marca/modelo/año/motor. Datos estructurados `vehicle` y `serviceId` se suministran por `/api/simulate`; el chat libre no los adivina. El panel permite probar cotizaciones con los campos estructurados de vehículo y servicio. No confirma turnos, garantías, descuentos ni diagnósticos. Reclamos pasan a humano; los mensajes posteriores no activan respuestas automáticas. Volver a IA requiere acción expresa en el panel.

## IA

`lib/engine.mjs` contiene política determinista y contrato `provider.draft({text,history,tone,services})`. Sin proveedor funciona un **simulador de reglas**, no un modelo de lenguaje. El contrato permite inyectar un proveedor desde el servidor; cualquier salida externa se mantiene en revisión, nunca fija precios ni se envía automáticamente. El adaptador OpenAI Responses está implementado y desactivado por defecto; ver la configuración al final de este documento. No se simula que existe una conexión de IA real.

## Supabase preparado, aún no provisionado

Crear un proyecto nuevo y ejecutar `db/schema.sql` una vez desde SQL Editor; luego `db/verify.sql`. Configurar `STORAGE=supabase`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor. RLS habilitado, sin acceso de anon/authenticated, con grants explícitos a service_role. El navegador accede mediante API autenticada del servidor. Nunca publicar la clave service_role.

Esta primera base almacena un workspace JSON con conversaciones, mensajes, catálogo, alertas, eventos deduplicados y auditoría. **Requiere una sola instancia Node persistente**, que serializa escrituras; no desplegar con varias réplicas ni como funciones Vercel. Antes de escalar: normalizar tablas, paginar, agregar transacciones y cola durable, deduplicación por índice único y control de versión entre instancias. La base SQL no pudo ejecutarse sin proyecto/credenciales; no se afirma que esté provisionada o verificada en remoto.


## Avance multicanal (31/10/2026)

- Panel visual actualizado a la identidad de [valentinomotors.com](https://www.valentinomotors.com/): rojo `#E8000F`, negro y familias **Bebas Neue / Outfit**.
- El simulador permite elegir **WhatsApp, Instagram DM o comentario público**. Los casos de prueba quedan separados por canal en la bandeja. No son mensajes reales.
- Solicitudes de turno, reserva, cita, agenda o disponibilidad pasan a **revisión humana** con borrador para solicitar datos; **solo Valentino confirma**. No hay integración de calendario.
- Los comentarios de Instagram pasan siempre a revisión humana; no se publica ni se envía respuesta privada desde el sistema.
- La primera respuesta saluda una vez; las siguientes no repiten el saludo automático.
- Todos los cambios se desarrollan en `feat/asistente-valentino`, conservando el formulario inicial en `index.html`. La PR #1 es de revisión, no está desplegada.
- No registrar en Git datos bancarios, tokens Meta, credenciales ni datos personales de clientes. Para imágenes de conversaciones, anonimizar números e identificadores.

### Próxima integración (aún pendiente)

1. Proyecto Supabase con almacenamiento transaccional por conversaciones/usuarios, acceso por rol y auditoría.
2. Credenciales oficiales Meta, permisos validados y coexistencia del número de WhatsApp Business confirmada en la cuenta de Valentino.
3. Implementar envío real por canal con control de ventana de atención, reintentos, límites, consentimiento y mecanismo de **pausa inmediata** cuando Valentino intervenga.
4. Aprobar política de respuestas comerciales, precios vigentes, garantías y excepciones; probar en modo borrador antes del envío automático.
5. Desplegar backend persistente con TLS; esta primera versión Node **no es apta para ejecutar como funciones serverless de Vercel** y no se debe exponer públicamente sin autenticación y despliegue apropiados.


## Webhooks y despliegue

`GET/POST /webhooks/meta`: desactivados por defecto, challenge con token y POST con HMAC SHA-256 del cuerpo crudo. Normaliza mensajes de texto Instagram/WhatsApp, eventos de comentarios Instagram con `field:comments` e ignora ecos; guarda eventos idempotentes. Los comentarios siempre se derivan a revisión y nunca se publican. No procesa adjuntos ni estados de entrega aún. Incluso si se habilita la recepción, **no existe código de envío real**. Mantener `META_WEBHOOKS_ENABLED=false` hasta tener API oficial, permisos y aprobación para conectar cuentas. Adaptadores sujetos a validación contra la versión oficial aprobada de Meta.

El servidor escucha en loopback; para hosting, usar proxy inverso HTTPS y una sola instancia persistente. `NODE_ENV=production` exige Supabase y token de panel de al menos 32 caracteres. El sitio Vercel existente continúa siendo el relevamiento estático; esta rama no cambia su producción. El dashboard requiere el servidor Node. Para producción también faltan acceso por usuario/SSO, rotación de claves, rate limit en proxy, backups, retención/borrado de datos y monitoreo. No exponer un servidor de pruebas públicamente.

## Pendientes de configuración y secretos

- Relevamiento completo: servicios, compatibilidad exacta, precios/moneda/vigencia, exclusiones, garantías, horarios y proceso de turnos; mensajes reales anonimizados para aprobar el tono.
- `DASHBOARD_TOKEN`: secreto aleatorio de 32+ caracteres; gestión de usuarios antes de uso de equipo.
- Proyecto Supabase, URL y service_role; aplicar y verificar SQL, backups y región.
- Clave/modelo de IA, presupuesto y límites; adaptador preparado, no requerido para simulaciones.
- Hosting Node persistente, dominio HTTPS y proxy; `PORT` opcional.
- Después de obtener permisos: App Meta, versión de API, `META_APP_SECRET`, `META_VERIFY_TOKEN`, IDs de cuentas/número y token de acceso con mínimos permisos. No cargarlos ni conectar cuentas ahora.
- Destinatarios y canal de alertas externas: por ahora solo alertas internas en dashboard. No se enviaron correos ni WhatsApp.

## Validación

`npm test`: cotización exacta, datos faltantes, vencimiento, duplicidad de precios, derivaciones, pausa humana, borradores de proveedor, firma alterada, ecos, autenticación API, webhook desactivado, persistencia y deduplicación. Las pruebas usan almacenamiento aislado en memoria. Las verificaciones de Supabase y cuentas oficiales quedan pendientes de credenciales.

Fuentes de seguridad: [Supabase API](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). El modelo de permisos conserva claves privilegiadas fuera del cliente. Un flujo de GitHub Actions valida sintaxis y pruebas en cada commit de la rama y la PR.

## Adaptador IA implementado

`lib/provider.mjs` admite **Groq Chat Completions** (recomendado para este proyecto) y OpenAI Responses de forma opcional. Para borradores con Groq configurar `AI_ENABLED=true`, `AI_PROVIDER=groq`, `GROQ_API_KEY` y `GROQ_MODEL` con un identificador compatible activo. Alternativa: `AI_PROVIDER=openai` con `OPENAI_API_KEY` y `OPENAI_MODEL`. Mantener `AI_ENABLED=false` hasta configurar entorno protegido. Los borradores generados por modelos **siempre quedan en revisión humana** y nunca se envían a Meta. No se probó ningún proveedor con claves reales. Groq: https://console.groq.com/docs/api-reference ; OpenAI: https://developers.openai.com/api/docs/guides/migrate-to-responses

El panel incluye campos de marca/modelo/año/motor y selector de servicio aprobado para probar cotizaciones exactas. Estos datos no se deducen del chat libre.
