# Groq · redacción del asistente Valentino Motors LG

Este proyecto **no publica respuestas en WhatsApp/Instagram**. Activa redacción de mensajes dentro del simulador del panel de Valentino, sin envíos reales. La API key nunca se solicita en la web y **no va en Supabase ni en GitHub**.

## 1. Crear una API key

Ir a https://console.groq.com/keys , iniciar sesión y usar **Create API Key**. Darle un nombre identificable (p. ej., `valentino-motors-vercel`). La clave solo se verá al crearla: guardarla en Vercel, sin enviarla al chat ni subirla al repositorio.

## 2. Agregar cuatro variables privadas en Vercel

Proyecto: https://vercel.com/brunnojuarez553-designs-projects/asistentevirtualvalentino/settings/environment-variables

| Variable | Valor |
| --- | --- |
| `AI_ENABLED` | `true` |
| `AI_PROVIDER` | `groq` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `GROQ_API_KEY` | Clave privada creada en Groq (marcar Sensitive) |

Activar **Production**. Si se quiere probar primero un deployment de desarrollo, agregar también **Preview**. Después hacer **Redeploy** de producción para que las funciones de Vercel reciban las variables nuevas.

El endpoint usado es `POST https://api.groq.com/openai/v1/chat/completions` con `Authorization: Bearer`. Se llama **solo desde el servidor**. La documentación oficial para comprobar el modelo vigente y los límites es https://console.groq.com/docs/models.

## 3. Probar dentro de Valentino

Abrir https://asistentevirtualvalentino.vercel.app/#inbox e iniciar sesión. El indicador debe decir **“Groq configurado”**. Esto confirma que las variables necesarias existen, no que las llamadas estén autorizadas o tengan saldo.

- Pulsar **+ Nueva** e ingresar por ejemplo: `Saludos, ¿cuánto sale el servicio EGR para mi Toyota Corolla 2025?`
- La IA debe redactar una respuesta natural, pedir la motorización si es necesaria, ofrecer revisión de compatibilidad y **no inventar un precio**.
- Continuar la misma conversación con `Es motor 2.0, ¿puedo llevarlo el jueves?`. La solicitud de turno debe quedar para revisión humana; Valentino confirma manualmente.
- Seleccionar una conversación previa en **Revisión**, pulsar **Redactar borrador con Groq** y revisar el texto antes de guardarlo. **No se publica ni se envía** nada desde esa acción.
- Probar una pregunta sobre ubicación y horarios; la IA debe usar únicamente la información validada guardada en Configuración de IA / Relevamiento.
- Probar un comentario de Instagram; la propuesta debe mantenerse como **borrador moderado**.

Si el indicador sigue desactivado, comprobar que el Redeploy utilizó las variables de Production. Si muestra configurado pero la respuesta avisa de proveedor no disponible, verificar el modelo, créditos, límites de la cuenta y el log del deployment de Vercel sin compartir el secreto.

## 4. Estilo de Valentino

Los registros actuales guardan tono español venezolano cálido/respetuoso, saludo una sola vez y ejemplos orientativos como:
- `Saludos, buen día. ¿En qué podemos ayudarle?`
- `Con gusto. ¿Me confirma la marca, modelo, año y motorización del vehículo?`
- `Para coordinar su visita, indíquenos el día de preferencia. Valentino le confirmará personalmente la disponibilidad.`

**Importante:** estos son los ejemplos almacenados actualmente. No se pudieron verificar en los datos del proyecto las conversaciones originales completas de Valentino que el cliente había enviado previamente. Para perfeccionar la voz auténtica sin inventar frases, pegar respuestas reales previamente autorizadas en **Configuración de IA → Ejemplos del estilo de Valentino**, una respuesta por línea. El panel las almacena en Supabase; el motor las inyecta en contexto con cada conversación. No se requiere reentrenar un modelo ni modificar el código por cada frase.

## 5. Qué puede contestar y qué requiere validación

Los 11 servicios de referencia están cargados en `vm_services`, pero actualmente todos tienen `approved=false`. No habilitar automáticamente todas las tarifas: Valentino debe revisar aplicación técnica/legal, compatibilidad, garantías y precio vigente.

El modelo puede orientar con datos empresariales y consultas generales; para un servicio sin ficha aprobada, **pregunta lo necesario y deriva la confirmación comercial**. No puede inventar importes. El backend además bloquea un importe monetario generado por IA si falta una regla de precio exacta y aprobada.

La coexistencia de WhatsApp Business App + Cloud API, la recepción de mensajes de Meta y el envío automático son tareas distintas, todavía pendientes. No activar `META_WEBHOOKS_ENABLED` hasta terminarlo.
