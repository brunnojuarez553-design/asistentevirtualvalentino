# Dirección de producto · Austral Web Studio

## Identidad

Austral Web Studio es la marca de la plataforma. El logo SVG y la paleta provienen del sitio oficial: fondo #080a0f, superficies titanio, acento #f0a15e, tipografía de sistema y botones de acabado metálico. El encabezado, acceso, navegación y footer pertenecen a Austral. La empresa administrada se identifica aparte como negocio activo.

## Alcance real de esta versión

Valentino Motors LG es el negocio configurado. Su catálogo, vehículos, conocimiento, estilo de voz y permisos se conservan. La autenticación continúa autorizando contra esa organización; la identidad de Austral no cambia los permisos. El nombre del negocio activo se toma de la configuración del workspace. No hay un selector ficticio de empresas ni un botón de conectar cuentas que simule Embedded Signup.

## Siguientes etapas de plataforma

1. Separar administración de Austral y espacios de clientes. Resolver negocios desde membresías verificadas en servidor; seleccionar un negocio no debe otorgar acceso.
2. Hacer obligatorio business_id en cada operación, catálogo, historial y almacenamiento; migrar el workspace global antes de aceptar un segundo cliente. Verificar aislamiento entre dos negocios con pruebas de lectura, escritura y roles.
3. Implementar registro insertado oficial de Meta, intercambio de credenciales exclusivamente en servidor, almacenamiento protegido por empresa, desconexión y revocación. Vincular cada phone_number_id e Instagram ID con su negocio antes de procesar webhooks.
4. Preparar un entorno separado para revisores con datos de prueba, sin acceso al workspace real de Valentino. Realizar y grabar envío/recepción y administración de plantillas.
5. Conectar la entrega real con una cola duradera, idempotencia, estados de delivery, ventana de atención y supervisión humana. Probar la coexistencia con el número de Valentino antes del lanzamiento.

Cambiar la marca no significa que estos puntos estén implementados. Las pruebas manuales de App Review siguen aisladas bajo META_REVIEW_*. La aprobación y los permisos los determina Meta.

## Dominio

La publicación sigue en el proyecto Vercel existente para conservar continuidad. Un dominio de Austral para la aplicación requiere configurar su DNS y asociarlo al proyecto; no se cambia automáticamente desde el código.
