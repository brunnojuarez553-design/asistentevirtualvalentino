# Instagram: conexión y selección de consultas

Configuración oficial Meta: Austral Instagram, 1900101397728957.
Flujo: Unified Login, Instagram requerido, sin cuentas publicitarias.
Permisos solicitados: instagram_basic, instagram_manage_messages, instagram_manage_comments.
Duración configurada en Meta: 60 días. La pantalla permite renovar cuando vence.
Retorno: https://asistente.australwebstudio.com/integrations/instagram/callback
Receptor validado en Meta: https://asistente.australwebstudio.com/webhooks/meta
Campos suscritos: messages, comments, versión v27.0.

## Comportamiento publicado

Un propietario o administrador inicia la autorización desde Estado de canales. Se debe compartir exactamente una cuenta profesional por empresa; no se adivina una cuenta cuando Meta devuelve varias. Cada token se cifra con AES-GCM y se vincula a la empresa. La devolución OAuth verifica cookie de estado, desafío de uso único y membresía activa antes de guardar credenciales. Una cuenta no se puede asociar a dos empresas.

Después de autorizar, Habilitar recepción suscribe la cuenta en Meta y habilita sus canales. La autorización inicial y la recepción se muestran por separado. Los criterios se guardan por empresa: mensajes/comentarios, palabras o frases, y publicaciones opcionales. Sin palabras no se generan borradores. Reclamos, solicitudes de atención humana, seguridad y archivos se derivan. Los comentarios propios no generan respuestas. Cada comentario público tiene un hilo propio.

Modo disponible: borradores. No hay envíos automáticos ni publicación externa de comentarios. La aprobación de Meta no se asume por tener la app publicada.

## Pendiente antes de clientes reales y automatización

1. Autorizar una cuenta profesional de prueba con rol en la app.
2. Verificar un DM y un comentario reales en el panel; probar filtros y atención humana.
3. Implementar y comprobar el envío de respuestas bajo confirmación explícita para la demostración de permisos.
4. Grabar evidencia del flujo real y presentar App Review de los tres permisos. No afirmar llamadas o videos que no se realizaron.
5. Solo después de aprobación, pruebas y autorización del negocio, implementar/activar envíos automáticos seleccionados con ventanas de mensajería, prevención de duplicados y trazabilidad de entrega.

La recepción de clientes ajenos a roles de prueba requiere Advanced Access. Los comentarios requieren acceso avanzado incluso para sus notificaciones. Si un permiso o la suscripción es rechazado, la plataforma muestra el error y no presenta la cuenta como recepción activa.
