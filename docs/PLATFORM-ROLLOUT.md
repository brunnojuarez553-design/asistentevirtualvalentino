# Plataforma multinegocio y Google Calendar

## Implementación

El panel selecciona únicamente empresas con membresía activa. El servidor vuelve a comprobar la membresía en cada solicitud; el encabezado de empresa no otorga permisos. Los espacios de conversación, catálogo y las escrituras CAS se resuelven por empresa. Los negocios nuevos reciben configuración general sin servicios ni personalidad de Valentino.

La agenda usa OAuth con PKCE, estado de un solo uso ligado a cookie segura y tokens de renovación cifrados con AES-256-GCM y contexto de empresa. El calendario principal se consulta antes de reservar; la base serializa reservas de esta app. Google y la base no comparten una transacción: las modificaciones externas pueden competir con una reserva. Ante un resultado ambiguo, el panel permite comprobar el evento determinista antes de repetirlo.

Los turnos requieren confirmación manual de propietario o administrador. No se envían invitaciones ni se activa el agendamiento automático del asistente. El equipo puede agregarse con una cuenta ya existente y correo confirmado; esta función no envía correos.

## Antes de producción

1. Crear copia privada del workspace y aplicar `supabase/migrations/20261106052842_platform_multibusiness_calendar.sql`. No editar su payload ni reemplazar la fila legacy: la migración conserva sus versiones CAS.
2. Verificar columnas y valores de `vm_channels`; registrar cada identificador externo con su empresa. Los webhooks nuevos rechazan canales que no puedan resolver una empresa autorizada.
3. Registrar expresamente el usuario de Austral en `vm_platform_admins`. No promover automáticamente al usuario del cliente.
4. Configurar en el servidor `GOOGLE_CALENDAR_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL` (origen HTTPS sin ruta) y `INTEGRATION_ENCRYPTION_KEY` (32 bytes aleatorios en base64). No regenerar la clave mientras existan conexiones cifradas. Guardar su respaldo privado.
5. Habilitar Google Calendar API y configurar el consentimiento OAuth y redirect URI `${PUBLIC_APP_URL}/integrations/google/callback`. Los scopes son `calendar.events` y `calendar.events.freebusy`. En modo de prueba, registrar los usuarios de prueba; la publicación y verificación de Google dependen de la consola del propietario.
6. Desplegar primero en preview; probar dos empresas con cuentas distintas, rol de consulta, cambio de empresa durante solicitudes pendientes y denegación de acceso cruzado. Autorizar una cuenta Google de prueba, crear un turno, verificarlo en Google y comprobar el rechazo de solapamientos. No completar estos pasos con datos ficticios en producción.

## Límites actuales

La migración de este cambio no se ha aplicado a producción. No se han configurado credenciales de Google ni creado eventos reales. Las pruebas automatizadas usan dobles de Google y autenticación: no prueban el consentimiento ni el calendario real.

El registro insertado de Meta y la activación de mensajería real por empresa siguen pendientes. La consola de revisión utiliza los controles y activos de prueba existentes; no equivale a aprobación de Meta ni demuestra alta multicliente.
