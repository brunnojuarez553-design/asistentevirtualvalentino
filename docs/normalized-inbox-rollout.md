# Bandeja normalizada — fase de lectura segura

Esta fase incorpora el adaptador `lib/normalized-inbox.mjs` y dos rutas protegidas:
- `GET /api/normalized/conversations?state=review&limit=30`
- `GET /api/normalized/conversation?id=<UUID>&limit=100`

Ambas requieren autenticación del panel y usan exclusivamente la clave secreta **en el backend**. Todas las búsquedas de conversaciones se limitan a `VM_BUSINESS_ID`. El detalle comprueba primero que la conversación pertenece a ese negocio antes de consultar mensajes o derivaciones.

## Activación en entorno de pruebas
1. Verificar que las tablas `vm_businesses`, `vm_conversations`, `vm_messages` y `vm_handoffs` del esquema `db/provisioned_schema.sql` existen y tienen RLS habilitado, sin permisos públicos.
2. Confirmar el UUID real del negocio y los permisos del rol `service_role`.
3. Configurar en el servidor `NORMALIZED_INBOX_ENABLED=true`, `VM_BUSINESS_ID=<UUID>`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Nunca exponer secretos al navegador.
4. Probar consultas de un negocio válido y de otro negocio: la segunda debe devolver 404 en detalle.
5. Probar paginación/límites, historial de mensajes y derivaciones humanas.

## Importante
- **Feature flag desactivado por defecto.** No altera la bandeja existente ni el envío de Meta.
- Este adaptador es **solo lectura**. Todavía no escribe mensajes, contactos, estados ni derivaciones en tablas normalizadas. Por eso, puede mostrar una bandeja vacía aunque el workspace JSON tenga conversaciones.
- El siguiente paso será una migración controlada de los datos históricos, una escritura transaccional e idempotente para eventos nuevos y, finalmente, un cambio explícito de la fuente de lectura.
- El proyecto Supabase de Valentino no estaba accesible desde la conexión utilizada durante el desarrollo. No se aplicó ningún SQL a producción.
