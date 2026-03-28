# Handlers del Bot de Telegram — FitAI Assistant

## Arquitectura

El bot de Telegram **no tiene handlers en código tradicional**. Toda la lógica de manejo de mensajes está implementada en workflows de n8n. Este directorio documenta cómo se integran los handlers lógicos con n8n.

---

## Flujo de Mensajes

```
Usuario envía mensaje en Telegram
        ↓
Telegram Bot API envía webhook POST
        ↓
Nginx (reverse proxy) → /webhook/fitai-telegram
        ↓
n8n: FitAI - Telegram Webhook Handler
        ↓
Parsea el update de Telegram → extrae tipo de mensaje
        ↓
[Router lógico]
```

---

## Handlers Lógicos (implementados en n8n)

### 1. Handler de Comandos

Detecta mensajes que empiezan con `/`:

| Comando | Acción | Workflow |
|---------|--------|----------|
| `/start` | Inicia el proceso de onboarding o saluda si ya completó | FitAI - Onboarding Flow |
| `/plan` | Muestra el plan de comidas o ejercicio activo | FitAI - Main AI Agent (tool: get_current_plan) |
| `/progreso` | Calcula y muestra el progreso actual | FitAI - Main AI Agent (tool: calculate_progress) |
| `/ayuda` | Muestra mensaje de ayuda con los comandos disponibles | FitAI - Telegram Webhook Handler (respuesta directa) |

### 2. Handler de Texto Libre

Mensajes de texto que no son comandos. Se envían al agente principal:

- Conversación general sobre nutrición y fitness
- Reportar comidas consumidas
- Preguntas sobre el plan
- Expresar emociones o reportar estado
- Reportar peso actual

Procesado por: `FitAI - Main AI Agent`

### 3. Handler de Fotos

Cuando el usuario envía una foto (por ejemplo, de su comida):

- Se extrae la URL de la foto via Telegram API
- Se envía al agente con contexto de que es una imagen
- El agente puede analizar visualmente si se usa un modelo multimodal

Procesado por: `FitAI - Main AI Agent` (con capacidad de visión de GPT-4o)

### 4. Handler de Respuesta a Inline Keyboard

Cuando el usuario presiona un botón de respuesta rápida:

- Se recibe como `callback_query` en lugar de `message`
- Se parsea el `callback_data` para identificar la acción
- Se enruta según el contexto (onboarding, confirmación, selección)

Procesado por: `FitAI - Telegram Webhook Handler` → Router por tipo de update

---

## Verificación Pre-Handler

Antes de ejecutar cualquier handler, el `Webhook Handler` verifica:

1. **¿Existe el usuario?** — Busca en tabla `users` por `telegram_id`
2. **¿Tiene membresía activa?** — `memberships.status = 'active' AND expires_at > NOW()`
3. **¿Está dentro del rate limit?** — Verifica en Redis (`rate_limit:{telegram_id}`)

Si alguna verificación falla, se responde con un mensaje estándar y no se procesa el mensaje.

---

## Integración con n8n

Los handlers no existen como archivos de código en este directorio. Están implementados como nodos dentro de los workflows de n8n:

- **Webhook Trigger Node** → Recibe el HTTP POST de Telegram
- **Set Node** → Parsea y extrae datos del update
- **IF Node** → Determina tipo de mensaje (comando, texto, foto, callback)
- **Switch Node** → Enruta al workflow correspondiente
- **Execute Workflow Node** → Llama al sub-workflow apropiado
- **Telegram Node** → Envía la respuesta al usuario

Consulta `docs/n8n-flows.md` para la documentación detallada de cada workflow.

---

## Futuro: Handlers en Código

En una fase futura, si se requiere lógica que no sea práctica implementar en n8n (procesamiento de imágenes, cálculos complejos en tiempo real), se podrían crear handlers en este directorio como funciones Node.js que n8n invoque via HTTP Request.

```
src/bot/handlers/
├── README.md           # Este archivo
├── imageAnalysis.js    # (futuro) Análisis de imágenes de comida
└── complexCalc.js      # (futuro) Cálculos que excedan las capacidades de Code node
```
