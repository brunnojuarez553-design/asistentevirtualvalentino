# Austral Web Studio · preparación de App Review

## Estado

La captura del 6 de noviembre de 2026 muestra negocio aprobado y revisión de app en revisión. No confirma aprobación de permisos ni de Tech Provider. El panel de Valentino contiene una consola privada independiente para demostrar operaciones manuales con WhatsApp de prueba. La IA y los canales de clientes continúan sin envíos automáticos.

## Configuración en Vercel

Abrir el proyecto `asistentevirtualvalentino`, Settings → Environment Variables. Cargar en el entorno que se utilizará para los videos y hacer Redeploy. Nunca pegar tokens en chats, formularios del panel ni archivos del repositorio.

| Variable | Contenido |
| --- | --- |
| `META_REVIEW_ENABLED` | `true` para habilitar las pruebas manuales |
| `META_REVIEW_TEST_ASSETS_CONFIRMED` | `true` únicamente al confirmar que los activos son de prueba |
| `META_REVIEW_ACCESS_TOKEN` | Token privado del entorno de prueba, con acceso a esa WABA y permisos de mensajería/administración; marcar Sensitive |
| `META_REVIEW_GRAPH_VERSION` | Versión que indica Meta Developers en los ejemplos de API; formato `vNN.0` |
| `META_REVIEW_WABA_ID` | WhatsApp Business Account ID del entorno de prueba |
| `META_REVIEW_PHONE_NUMBER_ID` | Phone Number ID del remitente de prueba; no es el número telefónico |
| `META_REVIEW_RECIPIENT` | Teléfono propio o autorizado añadido como destinatario de prueba, formato internacional solo dígitos |
| `META_REVIEW_OPERATOR_IDS` | UUID de Supabase Auth de los operadores owner/admin que usarán la consola, separados por comas |

Los valores se obtienen en Meta Developers → caso de uso WhatsApp → configuración/pruebas de API, y el UUID en Supabase → Authentication → Users. Usar activos de prueba de Austral Web Studio; no migrar ni conectar el número actual de Valentino para este paso. La bandera de activos de prueba es una confirmación administrativa: el código comprueba relación WABA/número, pero no puede certificar que una cuenta sea de prueba solo a partir de esa bandera.

Las variables `META_REVIEW_*` no reutilizan los secretos del canal del cliente. No es necesario activar `META_WEBHOOKS_ENABLED` para estas demostraciones de envío y creación. Recibir conversaciones reales y verificar delivery por webhook siguen siendo trabajos separados.

## Recorrido de prueba

1. Iniciar sesión en `https://asistentevirtualvalentino.vercel.app/#metaReview` con un operador autorizado.
2. Actualizar estado y comprobar conexión con Meta. Configuración completa no significa permisos aprobados.
3. Consultar plantillas. Elegir una aprobada, solo texto y sin variables. En la WABA de prueba puede existir `hello_world`; usar lo que devuelva la cuenta real, sin asumir que exista.
4. Confirmar consentimiento del destinatario y enviar. Mostrar ID aceptado y recepción del mismo mensaje en WhatsApp. El servidor fija el destinatario: el navegador no puede cambiarlo.
5. Crear una plantilla con nombre único `aws_review_...`, idioma y texto de utilidad que describa un caso real. Mostrar su ID y estado. Meta puede rechazarla o reclasificarla; no presentar `PENDING` como aprobada.
6. Grabar dos videos independientes con explicación de los botones y de los datos utilizados, según las instrucciones concretas que muestre Meta para cada permiso. No mostrar tokens ni datos de clientes.

El servidor registra la intención antes de llamar a Graph y evita repetir una misma operación por su UUID, incluso si hay reintentos concurrentes. Si existe un timeout, revisar WhatsApp/Meta antes de crear otra operación: la API no ofrece aquí una garantía de entrega exactamente una vez. Se impone una pausa de 30 segundos por operador entre operaciones.

## Completar la solicitud

- En Configuración básica: icono, categoría, dominio/contacto. URLs públicas: `https://asistentevirtualvalentino.vercel.app/privacy`, `https://asistentevirtualvalentino.vercel.app/data-deletion` y `https://asistentevirtualvalentino.vercel.app/terms`. Las políticas deben describir los datos realmente recibidos, finalidad, proveedores, conservación y procedimiento de eliminación; no usar promesas que la app todavía no cumple.
- Pedir los permisos que utiliza la implementación y adjuntar evidencia real de `whatsapp_business_messaging` y `whatsapp_business_management` según los campos del panel actual.
- Proporcionar las instrucciones y acceso de revisión que solicite Meta. No compartir la cuenta personal de Valentino ni dar acceso a conversaciones de clientes; preparar un entorno aislado si el revisor necesita ingresar.
- Si la solicitud ya figura en revisión, comprobar qué permite editar Meta antes de reemplazar evidencias o reenviarla.

## Alcance y pendientes

Esta consola prepara las dos demostraciones de la captura. No implementa onboarding multicliente, almacenamiento de tokens por empresa, Embedded Signup ni revocación/desconexión de cuentas de clientes. La implementación actual del panel está limitada a la organización Valentino. Esos elementos deben completarse y probarse antes de vender una conexión multicliente operativa; la aprobación de Meta no los implementa por sí sola.

Faltan comprobar en vivo el token, permisos, WABA y destinatario; grabar los videos; revisar las URLs legales y el formulario de App Review. Las pruebas automatizadas usan Graph simulado y no sustituyen la evidencia real.

## Referencias oficiales

- https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers/
- https://www.postman.com/meta/whatsapp-business-platform/overview
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
