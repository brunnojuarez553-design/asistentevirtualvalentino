# Multimedia segura: Valentino Motors

## Estado
La rama incorpora un procesador de audios y fotos de **WhatsApp** bajo la variable `MEDIA_ANALYSIS_ENABLED=true`. Está **desactivado por defecto**. Los adjuntos de Instagram siguen en revisión humana sin análisis automático porque el webhook actual no obtiene identificadores descargables compatibles.

### Variables del backend
- `META_ACCESS_TOKEN`: token privado con permiso para recuperar archivos de la cuenta de WhatsApp Cloud API.
- `GROQ_API_KEY`: transcripción de audio con Whisper.
- `OPENAI_API_KEY` y `VISION_MODEL`: modelo multimodal de visión compatible con imágenes.
- `MEDIA_ANALYSIS_ENABLED=true`: activar solo en entorno de pruebas tras verificar permisos y facturación.

### Controles
- El servidor verifica identificador, dominio de descarga, MIME y tamaño (audio 12 MiB, foto 5 MiB).
- Se evita seguir redirecciones de descarga y se limita el tiempo de las peticiones.
- La transcripción y descripción se guardan como texto en el historial; el archivo binario no se almacena.
- **Siempre** se pausa la respuesta automática y se deriva a revisión humana; ninguna imagen genera un diagnóstico concluyente.
- Si falla la descarga o el proveedor, se conserva la derivación habitual sin interpretación inventada.
- Los mensajes duplicados del webhook se detectan antes de invocar al proveedor.

### Antes de producción
Verificar con mensajes reales de prueba: formatos OGG/Opus y JPEG, permisos Meta, límites de Groq/OpenAI, retención y privacidad de datos, observabilidad sin registrar contenido sensible, y el flujo completo de aprobación humana. El panel todavía no reproduce archivos ni muestra miniaturas. La integración de multimedia de Instagram y la bandeja visual de adjuntos siguen pendientes.
