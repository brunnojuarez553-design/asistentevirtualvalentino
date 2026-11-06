# Activación segura de escrituras concurrentes

## Alcance
Esta fase protege el registro existente `assistant_workspace` con compare-and-swap (CAS). **No** migra todavía conversaciones, mensajes o webhooks a tablas independientes.

## Antes de fusionar
1. Crear respaldo verificable de `public.assistant_workspace` y registrar su versión actual.
2. Aplicar `db/workspace_concurrency.sql` en un proyecto Supabase de prueba, no en producción.
3. Confirmar que `assistant_workspace.version` existe y que `vm_workspace_compare_and_swap` solo permite `EXECUTE` al rol `service_role`.
4. Ejecutar dos solicitudes simultáneas al simulador y comprobar que ambos eventos quedan registrados una sola vez.
5. Verificar que una versión obsoleta devuelve `false` sin modificar `payload`.
6. Verificar permisos y logs de Supabase y ejecutar las pruebas de GitHub Actions.
7. Solo después, programar la migración de producción y el despliegue en una ventana controlada. El código nuevo requiere la migración SQL aplicada **antes** de recibir escrituras.

## Limitaciones
- CAS impide la sobrescritura silenciosa entre instancias, pero sigue almacenando todo el workspace en un solo JSON.
- Bajo alta concurrencia se reintenta hasta cinco veces; después se devuelve HTTP 409.
- La generación de borradores Groq puede repetirse durante un conflicto: se debe separar el cálculo de la persistencia antes de escalar a alto tráfico.
- Los mensajes de Meta continúan en simulación, sin envío externo.
- La migración posterior a `vm_conversations`, `vm_messages` y `vm_webhook_events` permitirá mejores índices, idempotencia y auditoría.

## Reversión
Conservar el respaldo y el código previo. No desplegar una versión antigua que haga upsert del JSON sin control de versión mientras haya varias instancias escribiendo. Revertir aplicación y esquema solo en una ventana controlada.
