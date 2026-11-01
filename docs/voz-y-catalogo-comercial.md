# Valentino Motors LG · Guía de voz y catálogo comercial · 2026-11-01

## 1. Redacción del asistente (revisada contra muestras de Valentino)

La configuración provisional anterior usaba tuteo porque así figuraba en una guía genérica. **La evidencia más específica suministrada por Valentino el 26 de octubre de 2026 muestra un registro comercial más formal**, con **usted / le / su**, saludos cortos y pedidos técnicos expresados con cortesía. Esta evidencia más específica prevalece sobre las plantillas anteriores.

### Frases auténticas recuperadas (fragmentos, no transcripciones completas)

- «Gracias por comunicarte con VALENTINO MOTOR'S»
- «Indíquenos su requerimiento»
- «Para brindarle una atención de excelencia y formalizar su cita en nuestro sistema, le solicitamos cordialmente…»

La primera frase tiene «comunicarte» y se respeta como **excepción propia de la bienvenida original**; el cuerpo comercial y la gestión de citas utilizan predominantemente usted / le / su. En las notas anteriores también se identificaron «Saludos», «Con gusto» y «Buenas tardes» como expresiones frecuentes.

No conservamos aquí copias completas verificables de los videos o chats originales; no atribuir nuevas frases o ejemplos redactados por IA como citas literales de Valentino.

### Política operativa aplicada en `lib/valentino-voice.mjs`

- Hablar como el **equipo de Valentino Motors LG**, no fingir ser Valentino en persona.
- Respuesta breve, educada y útil a preguntas normales; más estructurada al recopilar datos para una cita o presupuesto.
- «Con gusto le orientamos», «Indíquenos», «¿Nos confirma…?», «le estaremos confirmando» en contexto; sin voseo argentino.
- Un solo saludo por conversación, sin doble «con gusto» ni formulismos redundantes.
- Recordar datos ya recibidos. Si el cliente dijo «Toyota Corolla 2.0», **2.0 ya es la cilindrada**: si falta el año, preguntar el año, no repetir qué motor tiene.
- Mantener precios, garantías, compatibilidades e intervenciones sujetas a revisión humana. No prometer modificaciones de emisiones ni confirmar una cita automáticamente.
- Comentarios de Instagram requieren revisión antes de ser publicados.
- La IA recibe `verifiedPhrases` como fragmentos auténticos separados de `examples`, que son **plantillas editables nuevas**, no muestras reales.

### Cambio en el panel

**Configuración de IA** muestra ahora los fragmentos originales recuperados y las plantillas de respuesta por separado. Tanto los parámetros de voz como el catálogo comercial están sincronizados con Supabase. Las conversaciones históricas no se reescriben automáticamente; el estilo nuevo rige para respuestas posteriores.

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

**Verificación de DB:** 11/11 aprobados comercialmente con texto público en tratamiento formal, sin restos de tuteo en las fichas; 11 con revisión técnica aún pendiente; 7 con revisión legal pendiente. Se conservaron `reference_price_usd` y no se crearon reglas `vm_price_rules` aprobadas.

### Regla del software

`approved` representa autorización de **copy comercial**. `needs_technical_review` y `needs_legal_review` son controles independientes que no se han cerrado. `toEngineService` pasa esos indicadores al modelo; `lib/provider.mjs` proporciona solamente `publicCopy` para servicios con revisiones pendientes, sin exponer descripción técnica, garantías o precio interno. `validateService` exige texto comercial público para aprobar.

### Pendientes de aceptación definitiva con Valentino

- Validar motorizaciones, versiones, transmisiones y condiciones efectivas para cada servicio.
- Verificar procedimientos sujetos a normativa y controles ambientales (especialmente cualquier modificación EGR / emisiones), y trabajos de alto voltaje en híbridos.
- Confirmar precios vigentes por vehículo/servicio, garantía exacta, moneda y condiciones antes de habilitar cualquier cotización.
- Obtener muestras **reales** de su escritura si se requiere imitar de manera más fiel el vocabulario de Valentino.

**No activar Meta automáticamente**: WhatsApp con coexistencia oficial y mensajes/comentarios de Instagram requieren configuración y pruebas específicas.
