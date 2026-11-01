# Valentino Motors LG · Guía de voz y catálogo comercial · 2026-11-01

## 1. Redacción del asistente

La indicación original del proyecto define **español venezolano de trato cercano y profesional**, **tuteo (tú / te)**, **sin voseo (vos / tenés / podés)**. La configuración anterior había impuesto trato de `usted`; quedó corregida en Supabase, `config/default.json` y `lib/provider.mjs`.

- Voz cálida y natural, mensajes de WhatsApp generalmente de 1 a 3 oraciones, sin jerga excesiva ni fórmulas de robot.
- Hablar como **el equipo de Valentino Motors LG**, no fingir ser Valentino como persona.
- Saludar una sola vez por conversación; responder el tema principal primero, pedir solo datos faltantes; no repetir marca o año si el cliente ya los proporcionó.
- Pedir marca/modelo/año/motorización y síntoma/servicio solo cuando sean relevantes.
- Horario y dirección salen del `assistant_workspace`, nunca de la creatividad del modelo.
- Un turno siempre queda sujeto a la confirmación manual de Valentino.
- Precios, garantías, compatibilidades e intervenciones técnicas necesitan aprobación específica; los precios de referencia son internos.
- Reclamos, diagnósticos complejos, intervenciones de seguridad y solicitudes humanas derivan al equipo.
- Comentarios públicos de Instagram siguen pendientes de revisión humana antes de su publicación.

### Ejemplos de estilo cargados

Estos seis ejemplos son **plantillas de redacción orientativas**, NO transcripciones verificadas de mensajes reales escritos por Valentino:

1. Saludos, buen día. ¿En qué podemos ayudarte?
2. Con gusto, ¿nos confirmas la marca, el modelo, el año y la motorización de tu vehículo?
3. Para orientarte mejor, cuéntanos qué falla presenta o qué servicio necesitas.
4. Envíanos el modelo, año y motor para verificar la compatibilidad y darte información correcta.
5. Indícanos qué día te gustaría venir. Valentino revisa la agenda y te confirma personalmente la disponibilidad.
6. Estamos en Catia La Mar, estado La Guaira. Te esperamos dentro de nuestro horario de atención.

Si se aportan conversaciones auténticas y autorizadas del taller, se pueden añadir en **Configuración de IA → Ejemplos del estilo de Valentino** para afinar su voz. No introducir datos personales identificables ni chats completos de clientes sin necesidad.

## 2. Catálogo comercial en Supabase

El 2026-11-01 se revisaron los 11 servicios de `vm_services`, se asignaron categorías y un `public_copy` **únicamente informativo**, y se estableció `approved=true` para uso como texto comercial. El estado no representa aprobación técnica/legal ni autoriza a ejecutar el trabajo o dar un importe.

| Servicio | Categoría de atención | Estado |
| --- | --- | --- |
| Blindaje Toyota Dynamic Force no híbrido | Blindajes y preparación | Copy aprobado / revisión técnica y legal pendiente |
| Blindaje Toyota Dynamic Force Hybrid | Blindajes y preparación | Copy aprobado / revisión técnica y legal pendiente |
| Diagnóstico integral de 54 puntos | Diagnóstico | Copy aprobado / revisión técnica y legal pendiente |
| Entonación integral Toyota 1GR-FE | Entonación y mantenimiento | Copy aprobado / revisión técnica y legal pendiente |
| Entonación integral Toyota Dynamic Force | Entonación y mantenimiento | Copy aprobado / revisión técnica y legal pendiente |
| Instalación Oil Catch Can | Accesorios y prevención | Copy aprobado / revisión técnica pendiente |
| Mantenimiento preventivo Toyota K320 | Transmisiones | Copy aprobado / revisión técnica pendiente |
| Mantenimiento preventivo Toyota UA80E | Transmisiones | Copy aprobado / revisión técnica pendiente |
| Pack Suzuki Swift 1.2 Z12E/K12D | Blindajes y preparación | Copy aprobado / revisión técnica y legal pendiente |
| Toyota Tacoma 2GR-FKS reprogramación (fase 2) | Reprogramación | Copy aprobado / revisión técnica y legal pendiente |
| Toyota Tacoma 2GR-FKS restauración (fase 1) | Entonación y mantenimiento | Copy aprobado / revisión técnica pendiente |

**Verificación de DB:** 11/11 aprobados comercialmente con texto público; 11 con revisión técnica aún pendiente; 7 con revisión legal pendiente. Se conservaron `reference_price_usd` y no se crearon reglas `vm_price_rules` aprobadas.

### Regla del software

`approved` representa autorización de **copy comercial**. `needs_technical_review` y `needs_legal_review` son controles independientes que no se han cerrado. `toEngineService` pasa esos indicadores al modelo; `lib/provider.mjs` proporciona solamente `publicCopy` para servicios con revisiones pendientes, sin exponer descripción técnica, garantías o precio interno. `validateService` exige texto comercial público para aprobar.

### Pendientes de aceptación definitiva con Valentino

- Validar motorizaciones, versiones, transmisiones y condiciones efectivas para cada servicio.
- Verificar procedimientos sujetos a normativa y controles ambientales (especialmente cualquier modificación EGR / emisiones), y trabajos de alto voltaje en híbridos.
- Confirmar precios vigentes por vehículo/servicio, garantía exacta, moneda y condiciones antes de habilitar cualquier cotización.
- Obtener muestras **reales** de su escritura si se requiere imitar de manera más fiel el vocabulario de Valentino.

**No activar Meta automáticamente**: WhatsApp con coexistencia oficial y mensajes/comentarios de Instagram requieren configuración y pruebas específicas.
