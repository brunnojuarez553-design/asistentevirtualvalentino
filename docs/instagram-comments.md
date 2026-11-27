# Instagram: comentarios y respuestas privadas

La aplicación recibe `comments` mediante `/webhooks/meta`, valida la firma SHA-256 sobre el cuerpo original y resuelve el negocio exclusivamente mediante el canal autorizado de la cuenta. Guarda todos los comentarios entrantes, tengan o no palabras clave. No importa histórico mediante webhooks y no promete recibir notificaciones que Meta no entregue.

Cada regla asocia palabras o frases, publicaciones opcionales, un servicio de su propio catálogo y un aviso público. La respuesta privada utiliza solamente el texto comercial aprobado del servicio, sin generar importes ni garantías mediante IA. Si dos servicios empatan o la consulta requiere atención humana, no se envía automáticamente.

## Procesamiento

1. Persistir el evento en `vm_meta_event_receipts`, con clave por negocio, cuenta y comentario.
2. Confirmar recepción a Meta; en Vercel, `waitUntil` mantiene el procesamiento después de responder.
3. Registrar la consulta en la bandeja mediante CAS. No realizar envíos dentro de mutaciones que se puedan repetir.
4. Comprobar cuenta, autorización vigente, recepción y fecha real del comentario en Meta.
5. Reservar de forma atómica el envío privado antes de `POST /{ig-account}/messages`, usando `recipient.comment_id`.
6. Solo tras confirmación de Meta, reservar y publicar `POST /{comment-id}/replies`.
7. Guardar ambos resultados, o dejar la incidencia para revisión. “Aceptado por Meta” no significa entregado.

Las reservas únicas por operación evitan repetir envíos por concurrencia, reinicios o notificaciones duplicadas. Un timeout o fallo de confirmación permanece pendiente; no se reintenta el POST automáticamente. Un privado aceptado y un comentario público fallido se muestran como resultado parcial para revisión.

El procesamiento recupera hasta 10 eventos recibidos pendientes por ejecución. Un nuevo webhook o el botón autenticado “Procesar comentarios pendientes” recupera eventos guardados antes de una interrupción. `waitUntil` no es una cola ilimitada ni elimina los límites de ejecución de Vercel. Para volúmenes altos o recuperación periódica sin nuevos eventos, agregar un worker programado con monitorización; no habilitar campañas masivas sin dimensionarlo.

La activación registra una fecha: los comentarios recibidos antes de ella no generan envíos retroactivos. Las respuestas privadas recibidas conservan su flujo de revisión manual. La continuación de la conversación requiere que el destinatario responda.

## Dependencias de Meta

Para Unified Login: aplicación publicada, cuenta profesional pública conectada, suscripciones `comments` y `messages`, token de integración vigente y permisos `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`. El acceso avanzado de Instagram requiere su propia revisión; la aprobación de WhatsApp no lo sustituye.

Meta permite una sola respuesta privada por comentario dentro de 7 días. Live se recibe para revisión, pero no se automatiza porque su ventana termina con la transmisión. Los comentarios propios se excluyen para evitar bucles. Los comentarios sin texto y respuestas anidadas se conservan para revisión.

Referencias oficiales:
- https://developers.facebook.com/documentation/instagram-platform/private-replies
- https://developers.facebook.com/documentation/instagram-platform/webhooks/setup
- https://developers.facebook.com/documentation/instagram-platform/webhooks/examples
- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package

## Estado del despliegue

El flujo requiere prueba real de comentario → webhook → privado → respuesta pública antes de anunciarlo como operativo. Las pruebas con mocks verifican contratos y controles; no acreditan permisos aprobados ni entrega real. El negocio Valentino Motors necesita conectar su propia cuenta. No se conecta la cuenta de Austral a Valentino ni se activa una campaña de un cliente en otro negocio.
