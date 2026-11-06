# Escritura normalizada: despliegue gradual

El proyecto real de Valentino está identificado, pero **esta funcionalidad permanece desactivada**. `NORMALIZED_WRITE_ENABLED` no debe habilitarse hasta que se cumplan estas condiciones:

1. Aplicar y probar `db/workspace_concurrency.sql` (el workspace real no tenía columna `version`).
2. Revisar y probar `db/normalized_ingest.sql` en una base aislada, y después desplegarlo en el proyecto correcto. La función usa `security invoker` y se concede solo a `service_role`.
3. Configurar `VM_BUSINESS_ID=7e06ba8f-2df5-41c1-8d6c-8fe471b3b6e4` en el backend.
4. Activar `NORMALIZED_WRITE_ENABLED=true` primero en un despliegue controlado. La escritura se realiza después de guardar el workspace, con IDs deterministas para evitar mensajes duplicados en reintentos.
5. Comprobar que un mismo evento recibido dos veces produce un solo mensaje normalizado; que audios e imágenes no disparan IA; y que los mensajes del asistente se guardan como `draft`, nunca como enviados.
6. Confirmar la recuperación ante fallo de red: **esta fase no tiene cola duradera ni reconciliador**. Si la escritura normalizada falla después de la del workspace, el cliente puede recibir un error aunque el evento ya esté guardado. No activar producción hasta agregar recuperación automática.
7. No activar envío Meta ni reemplazar la bandeja actual todavía.

Limitaciones: este RPC aún no crea contactos, identidades ni registros de `vm_handoffs`; `p_contact` y `p_channel` se reservan para una fase posterior. La bandeja normalizada puede mostrar conversaciones sin contacto vinculado. Es una integración parcial, no un cambio de almacenamiento definitivo.
