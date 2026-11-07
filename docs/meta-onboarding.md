# Conexión oficial de WhatsApp Business

El administrador de Austral crea el espacio del negocio. El cliente necesita una cuenta confirmada y membresía de propietario o administrador. En Estado de canales, el cliente prepara la conexión y continúa en la ventana oficial de Meta.

Antes de habilitar el flujo:

1. Configurar el registro insertado para usuarios de WhatsApp Business App en Meta y autorizar el dominio HTTPS de Austral. Verificar que Meta admita el número y que la configuración tenga los permisos correspondientes.
2. Ejecutar `db/meta-onboarding.sql` para impedir que un número vinculado se asigne a dos negocios.
3. Configurar en el servidor `META_APP_ID`, `META_SIGNUP_CONFIG_ID`, `META_GRAPH_VERSION`, `META_APP_SECRET` e `INTEGRATION_ENCRYPTION_KEY`. Usar una clave de 32 bytes en base64 y conservarla de forma segura. Habilitar `META_ONBOARDING_ENABLED=true` en el entorno de pruebas.
4. Probar con una empresa y un número elegible de prueba. Confirmar que Meta presenta la modalidad esperada, devuelve código e identificadores y que la conexión queda en el negocio correcto.

Esta etapa intercambia el código, valida el número en la WABA autorizada y guarda el token cifrado por empresa. La recepción requiere completar la suscripción de la WABA, el enrutamiento del webhook y la activación del canal. El envío por empresa, la sincronización del historial y la desconexión operativa quedan pendientes. El flujo actual admite una cuenta vinculada por empresa.
