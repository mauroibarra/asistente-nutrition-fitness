# Workflows de n8n — FitAI Assistant

## Arquitectura: Workflow Unificado

El handler principal integra toda la lógica de conversación en un único workflow de 18 nodos,
eliminando dependencias de sub-workflows:

```
telegramTrigger (webhookId: 63001b72-...)
    └─ Switch (tipo de mensaje)
          ├─ voice → Get Voice File → Transcribe Whisper → Set Text
          ├─ text  → Set Text from Message
          └─ callback_query → Set Text from Callback
                └─ Upsert User (PG: ON CONFLICT DO UPDATE)
                      └─ Check User & Membership (PG)
                            └─ IF membresía activa?
                                  ├─ NO → No Membership Message (Telegram)
                                  └─ SÍ → IF onboarding completo?
                                                ├─ NO → Onboarding Agent (GPT-4o-mini + Memory)
                                                └─ SÍ → FitAI Main AI Agent (GPT-4o + Memory)
                                                              └─ Send Response (Telegram)
```

## Lista de Workflows Activos (9)

| # | Nombre | ID | Trigger |
|---|--------|-----|---------|
| 1 | `FitAI - Telegram Webhook Handler` | `fI5u4rs3iXPfeXFl` | `telegramTrigger` |
| 2 | `FitAI - Meal Plan Generator` | `KQhP9lQNxCKeOsbJ` | Webhook interno |
| 3 | `FitAI - Meal Reminder Scheduler` | `SntGuE97yl9efvo5` | Cron |
| 4 | `FitAI - Weight Update Requester` | `tkSAHhjJnO4nTFsM` | Cron (semanal) |
| 5 | `FitAI - Progress Calculator` | `bhJ8qqZXr68Id3pH` | Webhook interno |
| 6 | `FitAI - Workout Plan Generator` | `ETjiYAUhXfsVSyWQ` | Webhook interno |
| 7 | `FitAI - RAG Personal Indexer` | `vAqqjXg2IE1ldgg3` | Webhook interno |
| 8 | `FitAI - Membership Alert` | `I4Q4C6SOPY2fnK3W` | Cron (diario) |

> **Nota**: `FitAI - Main AI Agent` y `FitAI - Onboarding Flow` fueron eliminados porque
> su lógica fue integrada directamente en el Telegram Webhook Handler.

---

## Patrones Aplicados

### 1. `telegramTrigger` (typeVersion 1.2) en lugar de Webhook genérico

El nodo `n8n-nodes-base.telegramTrigger` registra el webhook con Telegram automáticamente
al activar el workflow y valida el `X-Telegram-Bot-Api-Secret-Token` en cada request.

**Importante — comportamiento en n8n 2.x:**
- La ruta registrada internamente tiene formato `{webhookId}/webhook`
- La URL completa resultante es: `{WEBHOOK_URL}/webhook/{webhookId}/webhook`
- El secret token se genera como: `{workflowId}_{nodeId}` (solo `[a-zA-Z0-9_-]`)
- El nodo solo llama a `setWebhook` de Telegram si la credencial tiene el `accessToken` configurado

Si el webhook no se registra automáticamente:
```python
import requests, re
WORKFLOW_ID = "fI5u4rs3iXPfeXFl"
NODE_ID = "11111111-0001-4000-8000-000000000001"
SECRET = re.sub(r'[^a-zA-Z0-9_\-]', '', f"{WORKFLOW_ID}_{NODE_ID}")
WEBHOOK_URL = f"{NGROK_URL}/webhook/{WEBHOOK_ID}/webhook"
requests.post(f"https://api.telegram.org/bot{TOKEN}/setWebhook",
    data={"url": WEBHOOK_URL, "secret_token": SECRET,
          "allowed_updates": '["message","callback_query"]'})
```

### 2. Switch para normalización de tipos de mensaje

Un nodo Switch enruta por tipo (`voice`, `callback_query`, `text`) y cada rama termina en
un nodo Set que escribe `text_input`. El resto del flujo lee siempre `{{ $json.text_input }}`.

### 3. Agentes con memoria de ventana por `sessionId`

Cada agente (`@n8n/n8n-nodes-langchain.agent`) conecta:
- `lmChatOpenAi` (GPT-4o para Main Agent, GPT-4o-mini para Onboarding)
- `memoryBufferWindow` con `sessionId = telegram_id` para aislar conversaciones por usuario

### 4. Upsert de usuario en PostgreSQL

```sql
INSERT INTO users (telegram_id, first_name, ...) VALUES (...)
ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name, updated_at = NOW()
RETURNING id, telegram_id;
```

---

---

## Credenciales Necesarias en n8n

Configurar estas credenciales en n8n antes de importar los workflows:

| Credencial | Tipo en n8n | Variables necesarias | Usada por |
|-----------|------------|---------------------|-----------|
| OpenAI | OpenAI API | `OPENAI_API_KEY` | Main AI Agent, Meal Plan Generator, Workout Plan Generator, RAG Personal Indexer |
| Telegram Bot | Telegram API | `TELEGRAM_BOT_TOKEN` | Webhook Handler, Meal Reminder, Weight Update, Membership Alert |
| PostgreSQL | Postgres | `DATABASE_URL` (host, port, user, password, database) | Todos los workflows |
| Redis | Redis | `REDIS_URL` (host, port) | Webhook Handler, Onboarding Flow |
| Qdrant | HTTP Header Auth o API Key | `QDRANT_URL`, `QDRANT_API_KEY` | RAG Personal Indexer, Main AI Agent |

### Cómo Configurar Credenciales en n8n

1. Abrir n8n en el navegador (`http://localhost:5678`)
2. Ir a **Settings** → **Credentials**
3. Click en **Add Credential**
4. Seleccionar el tipo de credencial
5. Ingresar los valores (obtenidos de `.env`)
6. Click en **Save**

**Importante**: Las credenciales se almacenan encriptadas en la base de datos de n8n (usando `N8N_ENCRYPTION_KEY`). Nunca se exponen en los archivos JSON de los workflows.

---

## Orden de Importación Recomendado

Importar los workflows en este orden para que las referencias entre sub-workflows funcionen correctamente:

1. **Primero** (sin dependencias):
   - `FitAI - Meal Plan Generator`
   - `FitAI - Workout Plan Generator`
   - `FitAI - Progress Calculator`
   - `FitAI - RAG Personal Indexer`

2. **Segundo** (dependen de los anteriores como tools):
   - `FitAI - Onboarding Flow`
   - `FitAI - Main AI Agent`

3. **Tercero** (depende del Main AI Agent):
   - `FitAI - Telegram Webhook Handler`

4. **Último** (independientes, solo necesitan credenciales):
   - `FitAI - Meal Reminder Scheduler`
   - `FitAI - Weight Update Requester`
   - `FitAI - Membership Alert`

Después de importar, verificar que cada workflow referencia correctamente las credenciales y los sub-workflows.

---

## Cómo Testear Cada Workflow en Local

### Webhook Handler

```bash
# Simular un mensaje de Telegram (reemplazar chat_id con un ID de prueba)
curl -X POST http://localhost:5678/webhook-test/fitai-telegram \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456,
    "message": {
      "message_id": 1,
      "from": { "id": 12345678, "is_bot": false, "first_name": "Test" },
      "chat": { "id": 12345678, "type": "private" },
      "date": 1700000000,
      "text": "Hola, quiero empezar"
    }
  }'
```

### Main AI Agent

Ejecutar manualmente desde la UI de n8n con datos de prueba:
- `user_id`: ID de un usuario de prueba en la base de datos
- `message`: "¿Cómo va mi progreso esta semana?"
- `telegram_chat_id`: ID del chat de Telegram

### Meal Plan Generator / Workout Plan Generator

Ejecutar manualmente con `user_id` de un usuario que tenga perfil completo en `user_profiles`.

### Cron Workflows

1. Crear datos de prueba en la base de datos (usuario con membresía activa)
2. Ejecutar manualmente desde la UI de n8n (botón "Execute Workflow")
3. Verificar que el mensaje se envía correctamente a Telegram

---

## Uso de n8n-mcp desde Claude Code

El MCP de n8n permite interactuar con la instancia de n8n directamente desde Claude Code, sin abrir la UI:

### Listar Workflows Existentes

```
Usa la tool list_workflows de n8n-mcp para ver todos los workflows
```

### Crear un Workflow Nuevo

```
Usa la tool create_workflow de n8n-mcp con el JSON completo del workflow.
El JSON debe incluir: name, nodes, connections, settings.
```

### Activar/Desactivar un Workflow

```
Usa activate_workflow / deactivate_workflow con el ID del workflow.
Solo activa un workflow cuando esté completamente configurado y probado.
```

### Ejecutar un Workflow Manualmente

```
Usa execute_workflow con el ID del workflow y datos de entrada opcionales.
Útil para testear sin disparar el trigger real.
```

### Flujo Recomendado con n8n-mcp

1. Diseñar el workflow en `docs/n8n-flows.md`
2. Crear el workflow base con n8n-mcp (nodos principales)
3. Abrir la UI de n8n para:
   - Configurar credenciales (no se puede via MCP)
   - Ajustar configuraciones visuales de nodos
   - Probar con datos reales
4. Iterar via n8n-mcp para cambios programáticos
5. Exportar el workflow final y guardarlo en esta carpeta

---

## Uso de Skill Templates de n8n-skills

El repositorio https://github.com/czlonkowski/n8n-skills contiene patrones reutilizables:

### Cómo Obtener Templates

1. Clonar o navegar el repositorio en GitHub
2. Buscar templates relevantes:
   - AI Agent patterns (para el Main AI Agent)
   - Telegram bot patterns (para el Webhook Handler)
   - Scheduled task patterns (para los cron workflows)
3. Adaptar el template a las necesidades de FitAI:
   - Renombrar nodos para seguir la convención `FitAI - *`
   - Configurar credenciales de FitAI
   - Ajustar la lógica de negocio específica

### Templates Útiles para FitAI

- **AI Agent con Tools**: Patrón base para el `FitAI - Main AI Agent`
- **Telegram Webhook + Response**: Patrón base para el `FitAI - Telegram Webhook Handler`
- **Cron + Database Query + Notification**: Patrón base para los workflows scheduler

---

## Archivos de Workflows Exportados

Los workflows exportados en formato JSON se almacenan en esta carpeta:

```
n8n/workflows/
├── README.md                              # Este archivo
├── fitai-telegram-webhook-handler.json    # Workflow 1
├── fitai-main-ai-agent.json              # Workflow 2
├── fitai-onboarding-flow.json            # Workflow 3
├── fitai-meal-plan-generator.json        # Workflow 4
├── fitai-meal-reminder-scheduler.json    # Workflow 5
├── fitai-weight-update-requester.json    # Workflow 6
├── fitai-progress-calculator.json        # Workflow 7
├── fitai-workout-plan-generator.json     # Workflow 8
├── fitai-rag-personal-indexer.json       # Workflow 9
└── fitai-membership-alert.json           # Workflow 10
```

**Nota**: Los archivos JSON de workflows se generarán durante la fase de construcción. Esta carpeta está preparada para recibirlos.
