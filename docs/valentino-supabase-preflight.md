# Valentino Motors: verificación del proyecto real (2026-11-05)

Proyecto verificado: `oficyvzpwpfjnajaqkrg`. Negocio existente: `valentino-motors`, UUID `7e06ba8f-2df5-41c1-8d6c-8fe471b3b6e4`.

Consultas **solo lectura** confirmaron:
- Las tablas `vm_businesses`, `vm_conversations`, `vm_messages`, `vm_handoffs`, `vm_webhook_events` y otras existen.
- Hay 1 negocio, 0 conversaciones normalizadas, 0 mensajes normalizados y 0 eventos normalizados.
- El workspace legado tiene 6 conversaciones y 8 IDs de evento.
- `assistant_workspace` todavía no tiene la columna `version`; la migración CAS no está aplicada.

## Plan de migración sin pérdida
1. Crear copia de seguridad del workspace legado y verificarla **antes** de cualquier escritura.
2. Aplicar `db/workspace_concurrency.sql` tras revisar permisos, compatibilidad y una prueba en entorno aislado.
3. Ejecutar `db/normalized_preflight.sql` y `migrationPreflight` para contar mensajes, detectar IDs repetidos y comprobar consistencia sin mostrar información personal.
4. Implementar una importación idempotente y transaccional de las conversaciones existentes. Cada mensaje necesita identidad estable; la migración debe preservar el orden y los estados y asociarlos al negocio correcto.
5. Comparar cantidades e historiales de origen/destino. Solo entonces habilitar escrituras nuevas en tablas normalizadas.
6. Activar la lectura normalizada del panel mediante `NORMALIZED_INBOX_ENABLED=true` y `VM_BUSINESS_ID=7e06ba8f-2df5-41c1-8d6c-8fe471b3b6e4`, primero en un despliegue de prueba.
7. Mantener desactivado el envío real de Meta hasta validar idempotencia, permisos y derivaciones.

**No** se ejecutaron cambios de esquema ni importaciones de datos en el proyecto real durante esta inspección.
