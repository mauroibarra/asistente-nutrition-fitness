# Integraciones de API - FitAI Assistant

Documentacion completa de las cinco integraciones externas que componen el backend del asistente de nutricion y fitness basado en Telegram, orquestado con n8n y potenciado por OpenAI GPT-4o.

---

## Tabla de Contenidos

1. [Telegram Bot API](#1-telegram-bot-api)
2. [OpenAI API en n8n](#2-openai-api-en-n8n)
3. [Qdrant (Vector Store)](#3-qdrant-vector-store)
4. [PostgreSQL](#4-postgresql)
5. [Redis](#5-redis)

---

## 1. Telegram Bot API

### Descripcion General

El bot de Telegram es la interfaz principal de interaccion con los usuarios. Recibe mensajes de texto, fotos de alimentos y comandos, los enruta al flujo correspondiente en n8n y devuelve las respuestas generadas por el agente de IA.

### Creacion del Bot con BotFather

Para crear el bot se debe iniciar una conversacion con `@BotFather` en Telegram y seguir estos pasos:

1. Enviar `/newbot` a BotFather.
2. Proporcionar un nombre para el bot (ejemplo: `FitAI Assistant`).
3. Proporcionar un username unico que termine en `bot` (ejemplo: `fitai_assistant_bot`).
4. BotFather devolvera un **token** con el formato `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`.

Configuracion adicional recomendada en BotFather:

```
/setdescription - Asistente de nutricion y fitness con IA
/setabouttext - Tu coach personal de nutricion y entrenamiento
/setcommands - Registrar la lista de comandos disponibles
/setuserpic - Subir el avatar del bot
```

Registro de comandos en BotFather:

```
start - Iniciar o reiniciar el asistente
plan - Ver tu plan actual de nutricion o ejercicio
progreso - Consultar tu progreso y metricas
ayuda - Ver ayuda y comandos disponibles
```

### Configuracion del Webhook

El bot utiliza el modo webhook (en lugar de polling) para recibir actualizaciones en tiempo real. La URL del webhook se configura con una llamada a la API de Telegram:

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://{DOMAIN}/webhook/fitai-telegram",
    "allowed_updates": ["message", "callback_query"],
    "drop_pending_updates": true,
    "max_connections": 40
  }'
```

Verificacion del webhook:

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq .
```

Respuesta esperada:

```json
{
  "ok": true,
  "result": {
    "url": "https://{DOMAIN}/webhook/fitai-telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

### Tipos de Mensajes Soportados

#### Mensajes de Texto

El caso mas comun. El usuario envia texto libre y el agente de IA responde contextualmente. n8n recibe el payload completo del mensaje:

```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": {
      "id": 987654321,
      "is_bot": false,
      "first_name": "Carlos",
      "username": "carlos_fit",
      "language_code": "es"
    },
    "chat": {
      "id": 987654321,
      "first_name": "Carlos",
      "type": "private"
    },
    "date": 1711411200,
    "text": "Quiero un plan de alimentacion para ganar masa muscular"
  }
}
```

#### Mensajes con Foto

Cuando el usuario envia una foto (por ejemplo, de un platillo de comida), el bot la procesa mediante vision de GPT-4o para estimar macronutrientes:

```json
{
  "update_id": 123456790,
  "message": {
    "message_id": 43,
    "from": {
      "id": 987654321,
      "is_bot": false,
      "first_name": "Carlos"
    },
    "chat": {
      "id": 987654321,
      "type": "private"
    },
    "date": 1711411260,
    "photo": [
      {
        "file_id": "AgACAgIAAxkBAAI..._small",
        "file_unique_id": "AQADAgAT...",
        "file_size": 12540,
        "width": 320,
        "height": 240
      },
      {
        "file_id": "AgACAgIAAxkBAAI..._medium",
        "file_unique_id": "AQADAgAT...",
        "file_size": 54320,
        "width": 800,
        "height": 600
      },
      {
        "file_id": "AgACAgIAAxkBAAI..._large",
        "file_unique_id": "AQADAgAT...",
        "file_size": 134500,
        "width": 1280,
        "height": 960
      }
    ],
    "caption": "Esto fue mi almuerzo"
  }
}
```

Para obtener la URL de descarga de la foto se toma el `file_id` de mayor resolucion:

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${FILE_ID}" | jq .
```

```json
{
  "ok": true,
  "result": {
    "file_id": "AgACAgIAAxkBAAI..._large",
    "file_unique_id": "AQADAgAT...",
    "file_size": 134500,
    "file_path": "photos/file_42.jpg"
  }
}
```

La imagen se descarga desde:

```
https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}
```

#### Mensajes de Comandos

Los comandos inician con `/` y disparan flujos especificos en n8n.

### Comandos Disponibles

| Comando | Descripcion | Comportamiento |
|---------|-------------|----------------|
| `/start` | Inicia o reinicia la interaccion con el bot | Verifica membresia, inicia onboarding si es usuario nuevo, o muestra menu principal si ya tiene perfil |
| `/plan` | Consulta el plan activo | Muestra el plan de nutricion o ejercicio vigente con opcion de alternar entre ambos |
| `/progreso` | Consulta metricas de progreso | Muestra peso actual, tendencia, adherencia al plan y graficas de avance |
| `/ayuda` | Muestra la ayuda del bot | Lista todos los comandos y explica como interactuar con el asistente |

### Inline Keyboards

Los inline keyboards permiten ofrecer botones interactivos dentro de los mensajes del bot, facilitando la navegacion sin que el usuario tenga que escribir texto.

Envio de mensaje con inline keyboard:

```json
{
  "method": "sendMessage",
  "chat_id": 987654321,
  "text": "Selecciona que tipo de plan deseas consultar:",
  "parse_mode": "Markdown",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "Plan de Nutricion",
          "callback_data": "plan_nutrition"
        },
        {
          "text": "Plan de Ejercicio",
          "callback_data": "plan_exercise"
        }
      ],
      [
        {
          "text": "Registrar Peso",
          "callback_data": "log_weight"
        },
        {
          "text": "Ver Progreso",
          "callback_data": "view_progress"
        }
      ],
      [
        {
          "text": "Hablar con el Asistente",
          "callback_data": "free_chat"
        }
      ]
    ]
  }
}
```

Cuando el usuario presiona un boton, Telegram envia un `callback_query`:

```json
{
  "update_id": 123456791,
  "callback_query": {
    "id": "4382bfdwdsb323b2d9",
    "from": {
      "id": 987654321,
      "first_name": "Carlos",
      "username": "carlos_fit"
    },
    "message": {
      "message_id": 44,
      "chat": {
        "id": 987654321,
        "type": "private"
      }
    },
    "chat_instance": "8428209650730234",
    "data": "plan_nutrition"
  }
}
```

En n8n, el nodo Telegram Trigger captura tanto `message` como `callback_query`, y un nodo Switch los enruta al sub-flujo correspondiente.

Configuracion del nodo Telegram Trigger en n8n:

```json
{
  "node": "Telegram Trigger",
  "parameters": {
    "updates": ["message", "callback_query"],
    "additionalFields": {}
  },
  "credentials": {
    "telegramApi": "FitAI Bot Token"
  }
}
```

### Limites de la API de Telegram y Manejo de Errores

#### Limites de Rate

| Tipo de Limite | Valor |
|----------------|-------|
| Mensajes por segundo (a un mismo chat) | 1 msg/s |
| Mensajes por segundo (global del bot) | 30 msg/s |
| Mensajes por minuto a un grupo | 20 msg/min |
| Tamano maximo de archivo (descarga) | 20 MB |
| Tamano maximo de archivo (subida) | 50 MB |
| Longitud maxima de texto por mensaje | 4096 caracteres |
| Longitud maxima de caption | 1024 caracteres |

#### Codigos de Error Comunes

| Codigo | Descripcion | Accion Recomendada |
|--------|-------------|-------------------|
| 400 | Bad Request - parametros invalidos | Validar payload antes de enviar |
| 401 | Unauthorized - token invalido | Verificar token del bot |
| 403 | Forbidden - bot bloqueado por usuario | Marcar usuario como inactivo en BD |
| 429 | Too Many Requests | Respetar el campo `retry_after` en la respuesta |
| 409 | Conflict - webhook ya configurado | Eliminar webhook anterior con `deleteWebhook` |

#### Manejo de Errores en n8n

Se implementa un nodo Error Trigger conectado al workflow principal que captura errores de la API de Telegram y los registra:

```json
{
  "node": "IF - Telegram Error",
  "parameters": {
    "conditions": {
      "boolean": [
        {
          "value1": "={{ $json.error }}",
          "operation": "isNotEmpty"
        }
      ]
    }
  }
}
```

Cuando se detecta un error 429, el workflow espera el tiempo indicado y reintenta:

```json
{
  "node": "Wait - Rate Limit",
  "parameters": {
    "amount": "={{ $json.parameters.retry_after || 5 }}",
    "unit": "seconds"
  }
}
```

Para mensajes largos que excedan los 4096 caracteres, se fragmentan automaticamente:

```json
{
  "node": "Function - Split Long Message",
  "parameters": {
    "functionCode": "const text = $input.first().json.response_text;\nconst MAX_LENGTH = 4096;\nconst chunks = [];\n\nfor (let i = 0; i < text.length; i += MAX_LENGTH) {\n  chunks.push({ json: { chunk: text.substring(i, i + MAX_LENGTH), chat_id: $input.first().json.chat_id } });\n}\n\nreturn chunks;"
  }
}
```

---

## 2. OpenAI API en n8n

### Descripcion General

El agente de IA es el nucleo inteligente de FitAI Assistant. Utiliza el modelo GPT-4o a traves del nodo AI Agent de n8n, con memoria de conversacion, herramientas (tools) y acceso a la base de conocimiento vectorial para ofrecer respuestas personalizadas.

### Configuracion de la Credencial en n8n

En la seccion de credenciales de n8n, se crea una credencial de tipo **OpenAI API**:

```json
{
  "credentialType": "openAiApi",
  "name": "FitAI OpenAI",
  "data": {
    "apiKey": "${OPENAI_API_KEY}",
    "organizationId": "${OPENAI_ORG_ID}"
  }
}
```

Pasos en la interfaz de n8n:

1. Ir a **Settings > Credentials > Add Credential**.
2. Seleccionar **OpenAI API**.
3. Pegar la API key generada en `platform.openai.com/api-keys`.
4. Opcionalmente, agregar el Organization ID.
5. Hacer clic en **Save** y probar la conexion.

### Configuracion del Nodo AI Agent

El nodo **AI Agent** de n8n es el orquestador central. Se configura con el modelo, el system prompt, las herramientas y la memoria.

```json
{
  "node": "AI Agent",
  "type": "@n8n/n8n-nodes-langchain.agent",
  "parameters": {
    "agent": "openAiFunctionsAgent",
    "promptType": "define",
    "text": "={{ $json.message_text }}",
    "options": {
      "systemMessage": "Eres FitAI, un asistente experto en nutricion y fitness. Tu objetivo es ayudar al usuario a alcanzar sus metas de salud y composicion corporal.\n\nReglas:\n- Responde siempre en espanol.\n- Se conciso pero informativo (maximo 300 palabras por respuesta).\n- Usa datos del perfil del usuario para personalizar recomendaciones.\n- Cuando el usuario envie una foto de comida, analiza los alimentos visibles y estima macronutrientes.\n- Nunca des consejos medicos. Si el usuario reporta sintomas, recomienda consultar un profesional de salud.\n- Usa emojis con moderacion para hacer la conversacion mas amigable.\n\nPerfil del usuario:\n- Nombre: {{ $json.user_profile.first_name }}\n- Objetivo: {{ $json.user_profile.goal_type }}\n- Calorias diarias objetivo: {{ $json.user_profile.daily_calories }} kcal\n- Proteina objetivo: {{ $json.user_profile.protein_g }}g\n- Restricciones alimenticias: {{ $json.user_profile.dietary_restrictions }}\n- Nivel de actividad: {{ $json.user_profile.activity_level }}",
      "maxIterations": 5,
      "returnIntermediateSteps": false
    }
  },
  "credentials": {
    "openAiApi": "FitAI OpenAI"
  }
}
```

#### Parametros del Modelo

| Parametro | Valor | Justificacion |
|-----------|-------|---------------|
| `model` | `gpt-4o` | Modelo multimodal con soporte de vision y function calling |
| `temperature` | `0.7` | Balance entre creatividad y consistencia en recomendaciones |
| `max_tokens` | `1024` | Suficiente para respuestas detalladas sin exceso |
| `top_p` | `1.0` | Valor por defecto, sin restriccion adicional de muestreo |

Configuracion del modelo dentro del nodo AI Agent:

```json
{
  "node": "OpenAI Chat Model",
  "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "parameters": {
    "model": "gpt-4o",
    "options": {
      "temperature": 0.7,
      "maxTokens": 1024,
      "topP": 1.0,
      "frequencyPenalty": 0.1,
      "presencePenalty": 0.1
    }
  },
  "credentials": {
    "openAiApi": "FitAI OpenAI"
  }
}
```

### Definicion de Tools (Sub-Workflows)

En el nodo AI Agent de n8n, las herramientas (tools) se definen como sub-workflows que el agente puede invocar cuando necesita datos externos o ejecutar acciones. Cada tool se conecta al nodo AI Agent como un nodo hijo de tipo **Tool**.

#### Tool: Consultar Perfil del Usuario

```json
{
  "node": "Tool - Get User Profile",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "name": "get_user_profile",
    "description": "Obtiene el perfil completo del usuario incluyendo datos fisicos, objetivos y restricciones alimenticias. Usar cuando se necesite personalizar una recomendacion.",
    "workflowId": "{{ $vars.WF_GET_USER_PROFILE }}",
    "fields": {
      "values": [
        {
          "name": "telegram_id",
          "description": "ID de Telegram del usuario",
          "type": "number",
          "required": true
        }
      ]
    }
  }
}
```

#### Tool: Registrar Peso

```json
{
  "node": "Tool - Log Weight",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "name": "log_weight",
    "description": "Registra una nueva medicion de peso del usuario. Usar cuando el usuario indique su peso actual o quiera registrar una medicion.",
    "workflowId": "{{ $vars.WF_LOG_WEIGHT }}",
    "fields": {
      "values": [
        {
          "name": "telegram_id",
          "description": "ID de Telegram del usuario",
          "type": "number",
          "required": true
        },
        {
          "name": "weight_kg",
          "description": "Peso en kilogramos",
          "type": "number",
          "required": true
        },
        {
          "name": "notes",
          "description": "Notas adicionales sobre la medicion",
          "type": "string",
          "required": false
        }
      ]
    }
  }
}
```

#### Tool: Obtener Plan Activo

```json
{
  "node": "Tool - Get Active Plan",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "name": "get_active_plan",
    "description": "Obtiene el plan de nutricion o ejercicio activo del usuario. Usar cuando el usuario pregunte por su plan actual o necesite recordar que debe comer o entrenar.",
    "workflowId": "{{ $vars.WF_GET_ACTIVE_PLAN }}",
    "fields": {
      "values": [
        {
          "name": "telegram_id",
          "description": "ID de Telegram del usuario",
          "type": "number",
          "required": true
        },
        {
          "name": "plan_type",
          "description": "Tipo de plan: 'meal' para nutricion, 'exercise' para entrenamiento",
          "type": "string",
          "required": true
        }
      ]
    }
  }
}
```

#### Tool: Buscar en Base de Conocimiento

```json
{
  "node": "Tool - Knowledge Search",
  "type": "@n8n/n8n-nodes-langchain.toolVectorStore",
  "parameters": {
    "name": "search_knowledge_base",
    "description": "Busca informacion en la base de conocimiento de nutricion y fitness. Usar para responder preguntas tecnicas sobre nutricion, ejercicios, suplementos o principios de entrenamiento.",
    "topK": 4
  }
}
```

#### Tool: Consultar Progreso

```json
{
  "node": "Tool - Get Progress",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "parameters": {
    "name": "get_user_progress",
    "description": "Obtiene las metricas de progreso del usuario: historial de peso, adherencia al plan y estadisticas. Usar cuando el usuario pregunte por su progreso o quiera ver su avance.",
    "workflowId": "{{ $vars.WF_GET_PROGRESS }}",
    "fields": {
      "values": [
        {
          "name": "telegram_id",
          "description": "ID de Telegram del usuario",
          "type": "number",
          "required": true
        },
        {
          "name": "days",
          "description": "Numero de dias hacia atras para consultar (default 30)",
          "type": "number",
          "required": false
        }
      ]
    }
  }
}
```

### Window Buffer Memory

La memoria de conversacion permite al agente mantener contexto entre mensajes. Se utiliza el nodo **Window Buffer Memory** configurado para retener las ultimas 10 interacciones (pares usuario-asistente).

```json
{
  "node": "Window Buffer Memory",
  "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  "parameters": {
    "sessionKey": "={{ $json.chat_id }}",
    "contextWindowLength": 10,
    "sessionIdType": "customKey"
  }
}
```

La `sessionKey` se vincula al `chat_id` de Telegram para que cada usuario tenga su propio hilo de conversacion. Las 10 interacciones representan los ultimos 10 pares de mensajes (usuario + asistente = 20 mensajes en total), lo cual ofrece contexto suficiente sin elevar excesivamente el consumo de tokens.

### Vector Store Tool con Qdrant

El nodo **Vector Store Tool** conecta el agente con la coleccion de Qdrant que contiene la base de conocimiento de nutricion y fitness. Se conecta como nodo hijo del AI Agent:

```json
{
  "node": "Vector Store Tool - Knowledge",
  "type": "@n8n/n8n-nodes-langchain.toolVectorStore",
  "parameters": {
    "name": "nutrition_fitness_knowledge",
    "description": "Base de conocimiento experta en nutricion deportiva, planes de entrenamiento, suplementacion y composicion corporal. Consultar para responder preguntas tecnicas con informacion respaldada.",
    "topK": 4
  }
}
```

Este nodo se conecta a un **Qdrant Vector Store** node y un **Embeddings OpenAI** node:

```json
{
  "node": "Qdrant Vector Store - Knowledge",
  "type": "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  "parameters": {
    "qdrantCollection": {
      "__rl": true,
      "value": "knowledge_rag",
      "mode": "list"
    }
  },
  "credentials": {
    "qdrantApi": "FitAI Qdrant"
  }
}
```

```json
{
  "node": "Embeddings OpenAI",
  "type": "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
  "parameters": {
    "model": "text-embedding-3-small",
    "options": {
      "dimensions": 1536
    }
  },
  "credentials": {
    "openAiApi": "FitAI OpenAI"
  }
}
```

### Rate Limits y Manejo de Errores de OpenAI

#### Limites de Rate por Tier

| Tier | RPM (Requests) | TPM (Tokens) | RPD (Requests/dia) |
|------|----------------|---------------|---------------------|
| Tier 1 | 500 | 30,000 | 10,000 |
| Tier 2 | 5,000 | 450,000 | - |
| Tier 3 | 5,000 | 800,000 | - |

#### Codigos de Error de OpenAI

| Codigo | Error | Estrategia |
|--------|-------|------------|
| 401 | Invalid API Key | Verificar credencial en n8n |
| 429 | Rate Limit Exceeded | Implementar backoff exponencial; responder al usuario con mensaje de espera |
| 500 | Internal Server Error | Reintentar hasta 3 veces con espera de 2s entre intentos |
| 503 | Service Unavailable | Reintentar; si persiste, responder con mensaje de servicio no disponible |
| 400 | Context Length Exceeded | Reducir historial de conversacion y reintentar |

Implementacion del retry en n8n:

```json
{
  "node": "AI Agent",
  "onError": "continueErrorOutput",
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000
}
```

Mensaje de fallback cuando el agente no puede responder:

```json
{
  "node": "Telegram - Send Fallback",
  "parameters": {
    "chatId": "={{ $json.chat_id }}",
    "text": "Lo siento, estoy experimentando dificultades tecnicas en este momento. Por favor intenta de nuevo en unos minutos. Si el problema persiste, contacta a soporte.",
    "additionalFields": {
      "parse_mode": "Markdown"
    }
  }
}
```

### Estimacion de Costos

La estimacion de costos se basa en un usuario activo promedio que realiza entre 10 y 20 interacciones diarias con el bot.

| Concepto | Tokens Estimados | Costo Unitario | Costo Estimado |
|----------|-----------------|----------------|----------------|
| Input tokens (prompt + contexto) | ~3,000 por interaccion | $2.50 / 1M tokens | ~$0.0075 por interaccion |
| Output tokens (respuesta) | ~500 por interaccion | $10.00 / 1M tokens | ~$0.005 por interaccion |
| Embeddings (busqueda RAG) | ~200 por consulta | $0.02 / 1M tokens | ~$0.000004 por consulta |
| Vision (analisis de foto) | ~1,000 tokens por imagen | $2.50 / 1M tokens | ~$0.0025 por imagen |

**Costo estimado por usuario activo por dia: ~$0.15 - $0.30 USD**

Este rango asume entre 10 y 20 interacciones por dia, con 2-3 busquedas RAG y 1-2 analisis de fotos. El costo puede variar segun la longitud de las conversaciones y el uso de herramientas.

---

## 3. Qdrant (Vector Store)

### Descripcion General

Qdrant es la base de datos vectorial que almacena tanto el conocimiento general de nutricion y fitness como los datos contextuales por usuario. Permite realizar busquedas semanticas de alta velocidad para alimentar el contexto del agente con informacion relevante.

### Configuracion de la Credencial en n8n

```json
{
  "credentialType": "qdrantApi",
  "name": "FitAI Qdrant",
  "data": {
    "qdrantUrl": "http://qdrant:6333",
    "apiKey": "${QDRANT_API_KEY}"
  }
}
```

### Colecciones

Se utilizan dos colecciones principales, ambas con dimension 1536 correspondiente al modelo `text-embedding-3-small` de OpenAI.

#### Coleccion: `knowledge_rag`

Contiene documentos de conocimiento general sobre nutricion, fitness, suplementacion y principios de entrenamiento. Esta informacion es compartida entre todos los usuarios.

Creacion de la coleccion:

```bash
curl -X PUT "http://localhost:6333/collections/knowledge_rag" \
  -H "Content-Type: application/json" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "indexing_threshold": 10000
    },
    "replication_factor": 1
  }'
```

Estructura de un punto en `knowledge_rag`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "vector": [0.0123, -0.0456, 0.0789, "... (1536 dimensiones)"],
  "payload": {
    "content": "La proteina de suero de leche (whey protein) es una de las fuentes de proteina mas biodisponibles. Se recomienda consumir entre 1.6 y 2.2 gramos de proteina por kilogramo de peso corporal al dia para maximizar la sintesis proteica muscular.",
    "source": "nutrition_guide_v2",
    "category": "suplementacion",
    "subcategory": "proteinas",
    "language": "es",
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

#### Coleccion: `user_rag`

Almacena informacion contextual especifica de cada usuario: preferencias, historial de conversaciones relevantes, notas del asistente y resumen de planes anteriores. Los datos se filtran por `user_id` para garantizar el aislamiento.

Creacion de la coleccion:

```bash
curl -X PUT "http://localhost:6333/collections/user_rag" \
  -H "Content-Type: application/json" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "indexing_threshold": 10000
    },
    "replication_factor": 1
  }'
```

Creacion de indice por `user_id` para busquedas filtradas eficientes:

```bash
curl -X PUT "http://localhost:6333/collections/user_rag/index" \
  -H "Content-Type: application/json" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -d '{
    "field_name": "user_id",
    "field_schema": "integer"
  }'
```

Estructura de un punto en `user_rag`:

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440002",
  "vector": [0.0234, -0.0567, 0.0891, "... (1536 dimensiones)"],
  "payload": {
    "user_id": 987654321,
    "content": "El usuario prefiere entrenar por las mananas antes del trabajo. Tiene intolerancia a la lactosa y prefiere fuentes de proteina vegetal. Su objetivo principal es bajar grasa corporal manteniendo masa muscular.",
    "type": "user_preference",
    "created_at": "2026-02-20T14:15:00Z",
    "updated_at": "2026-03-10T09:30:00Z"
  }
}
```

### Upsert de Documentos con Metadata

#### Upsert en `knowledge_rag` (Carga de Base de Conocimiento)

Se utiliza el endpoint `upsert` para insertar o actualizar puntos. En n8n, esto se realiza con un nodo HTTP Request o con el nodo Qdrant nativo:

```bash
curl -X PUT "http://localhost:6333/collections/knowledge_rag/points" \
  -H "Content-Type: application/json" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -d '{
    "points": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "vector": [0.012, -0.034, 0.056, "..."],
        "payload": {
          "content": "El deficit calorico es el principio fundamental para la perdida de grasa. Se recomienda un deficit moderado de 300-500 kcal por dia para preservar masa muscular mientras se pierde grasa corporal.",
          "source": "nutrition_fundamentals",
          "category": "nutricion",
          "subcategory": "deficit_calorico",
          "language": "es",
          "created_at": "2026-01-20T08:00:00Z"
        }
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440011",
        "vector": [0.023, -0.045, 0.067, "..."],
        "payload": {
          "content": "La sobrecarga progresiva es el principio clave para la hipertrofia muscular. Consiste en aumentar gradualmente el estimulo de entrenamiento (peso, repeticiones, volumen o densidad) para forzar al musculo a adaptarse.",
          "source": "training_principles",
          "category": "entrenamiento",
          "subcategory": "hipertrofia",
          "language": "es",
          "created_at": "2026-01-20T08:00:00Z"
        }
      }
    ]
  }'
```

#### Upsert en `user_rag` (Datos de Usuario)

En n8n, el sub-workflow de upsert de datos de usuario sigue este patron:

```json
{
  "node": "HTTP Request - Qdrant Upsert User Data",
  "parameters": {
    "method": "PUT",
    "url": "http://qdrant:6333/collections/user_rag/points",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "api-key",
          "value": "{{ $credentials.qdrantApi.apiKey }}"
        }
      ]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "points",
          "value": "=[{\"id\": \"{{ $json.point_id }}\", \"vector\": {{ $json.embedding }}, \"payload\": {\"user_id\": {{ $json.telegram_id }}, \"content\": \"{{ $json.content }}\", \"type\": \"{{ $json.content_type }}\", \"created_at\": \"{{ $now.toISO() }}\"}}]"
        }
      ]
    }
  }
}
```

### Busqueda con Filtros por user_id

La busqueda semantica en `user_rag` siempre incluye un filtro por `user_id` para garantizar que un usuario solo acceda a sus propios datos:

```bash
curl -X POST "http://localhost:6333/collections/user_rag/points/search" \
  -H "Content-Type: application/json" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -d '{
    "vector": [0.012, -0.034, 0.056, "... (1536 dimensiones)"],
    "filter": {
      "must": [
        {
          "key": "user_id",
          "match": {
            "value": 987654321
          }
        }
      ]
    },
    "limit": 5,
    "with_payload": true,
    "score_threshold": 0.7
  }'
```

Respuesta de ejemplo:

```json
{
  "result": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "version": 3,
      "score": 0.89,
      "payload": {
        "user_id": 987654321,
        "content": "El usuario prefiere entrenar por las mananas antes del trabajo. Tiene intolerancia a la lactosa y prefiere fuentes de proteina vegetal.",
        "type": "user_preference",
        "created_at": "2026-02-20T14:15:00Z"
      }
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440005",
      "version": 2,
      "score": 0.82,
      "payload": {
        "user_id": 987654321,
        "content": "Resumen del plan anterior: el usuario logro bajar 2.3kg en 4 semanas con dieta de 2100 kcal y entrenamiento de fuerza 4 dias por semana.",
        "type": "plan_summary",
        "created_at": "2026-03-01T16:45:00Z"
      }
    }
  ],
  "status": "ok",
  "time": 0.0034
}
```

Busqueda en `knowledge_rag` (sin filtro de usuario):

```bash
curl -X POST "http://localhost:6333/collections/knowledge_rag/points/search" \
  -H "Content-Type: application/json" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -d '{
    "vector": [0.023, -0.045, 0.067, "... (1536 dimensiones)"],
    "limit": 4,
    "with_payload": true,
    "score_threshold": 0.65
  }'
```

### Nodo Qdrant Nativo de n8n

n8n incluye un nodo nativo para Qdrant que simplifica la integracion sin necesidad de usar nodos HTTP Request. Se utiliza principalmente como componente del AI Agent:

```json
{
  "node": "Qdrant Vector Store",
  "type": "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  "parameters": {
    "mode": "retrieve",
    "qdrantCollection": {
      "__rl": true,
      "value": "knowledge_rag",
      "mode": "list"
    },
    "options": {
      "searchFilterJson": ""
    }
  },
  "credentials": {
    "qdrantApi": "FitAI Qdrant"
  }
}
```

Para insertar documentos en la coleccion (modo insert, usado en el workflow de ingesta de conocimiento):

```json
{
  "node": "Qdrant Vector Store - Insert",
  "type": "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  "parameters": {
    "mode": "insert",
    "qdrantCollection": {
      "__rl": true,
      "value": "knowledge_rag",
      "mode": "list"
    },
    "options": {}
  },
  "credentials": {
    "qdrantApi": "FitAI Qdrant"
  }
}
```

---

## 4. PostgreSQL

### Descripcion General

PostgreSQL es la base de datos relacional principal del sistema. Almacena toda la informacion estructurada: usuarios, membresias, perfiles, planes, registros de peso, logs de conversacion y datos administrativos. Se accede desde n8n mediante el nodo nativo de Postgres.

### Configuracion de la Credencial en n8n

```json
{
  "credentialType": "postgres",
  "name": "FitAI PostgreSQL",
  "data": {
    "host": "${POSTGRES_HOST}",
    "port": 5432,
    "database": "fitai",
    "user": "${POSTGRES_USER}",
    "password": "${POSTGRES_PASSWORD}",
    "ssl": "disable"
  }
}
```

Pasos en la interfaz de n8n:

1. Ir a **Settings > Credentials > Add Credential**.
2. Seleccionar **Postgres**.
3. Completar host, puerto, nombre de la base de datos, usuario y contrasena.
4. En entornos de produccion, habilitar SSL con el modo `require` o `verify-full`.
5. Hacer clic en **Save** y verificar la conexion.

### Nodo Postgres en Workflows

El nodo Postgres de n8n permite ejecutar consultas SQL directamente dentro de los workflows. Se puede usar en modo **Execute Query** para consultas personalizadas o en modo **Insert/Update/Delete** para operaciones CRUD simples.

Configuracion basica del nodo:

```json
{
  "node": "Postgres",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "",
    "options": {
      "queryReplacement": ""
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

### Tablas del Sistema

| Tabla | Descripcion |
|-------|-------------|
| `users` | Usuarios registrados del bot |
| `memberships` | Membresias activas e historicas |
| `payment_logs` | Registro de pagos y transacciones |
| `user_profiles` | Perfil fisico y preferencias del usuario |
| `goals` | Objetivos de salud y fitness |
| `meal_plans` | Planes de nutricion generados |
| `exercise_plans` | Planes de entrenamiento generados |
| `weight_logs` | Registros de peso historicos |
| `conversation_logs` | Historial de conversaciones con el agente |
| `admin_users` | Usuarios con privilegios administrativos |

### Patrones de Queries Frecuentes

#### Verificacion de Membresia

Esta consulta se ejecuta en cada interaccion para verificar que el usuario tenga una membresia activa antes de procesar su mensaje:

```json
{
  "node": "Postgres - Check Membership",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT u.id AS user_id, u.telegram_id, u.first_name, u.username, m.plan_type, m.status, m.expires_at FROM users u INNER JOIN memberships m ON u.id = m.user_id WHERE u.telegram_id = $1 AND m.status = 'active' AND m.expires_at > NOW() ORDER BY m.expires_at DESC LIMIT 1;",
    "options": {
      "queryReplacement": "={{ $json.from.id }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

Respuesta esperada:

```json
[
  {
    "user_id": 42,
    "telegram_id": 987654321,
    "first_name": "Carlos",
    "username": "carlos_fit",
    "plan_type": "premium",
    "status": "active",
    "expires_at": "2026-04-15T23:59:59.000Z"
  }
]
```

Si la consulta no devuelve resultados, el bot responde con un mensaje indicando que la membresia no esta activa y ofrece opciones de suscripcion.

#### Obtener Perfil del Usuario

```json
{
  "node": "Postgres - Get User Profile",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT up.*, g.goal_type, g.target_weight_kg, g.target_date, g.daily_calories, g.protein_g, g.carbs_g, g.fat_g FROM user_profiles up LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true WHERE up.user_id = $1;",
    "options": {
      "queryReplacement": "={{ $json.user_id }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Registrar Nuevo Usuario

Se ejecuta cuando un usuario nuevo inicia el bot con `/start`:

```json
{
  "node": "Postgres - Insert User",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO users (telegram_id, first_name, last_name, username, language_code, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, username = EXCLUDED.username, updated_at = NOW() RETURNING id, telegram_id, first_name, created_at;",
    "options": {
      "queryReplacement": "={{ $json.from.id }},={{ $json.from.first_name }},={{ $json.from.last_name || '' }},={{ $json.from.username || '' }},={{ $json.from.language_code || 'es' }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Guardar Perfil de Usuario (Post-Onboarding)

```json
{
  "node": "Postgres - Save User Profile",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO user_profiles (user_id, age, gender, height_cm, weight_kg, activity_level, dietary_restrictions, health_conditions, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET age = EXCLUDED.age, gender = EXCLUDED.gender, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg, activity_level = EXCLUDED.activity_level, dietary_restrictions = EXCLUDED.dietary_restrictions, health_conditions = EXCLUDED.health_conditions, updated_at = NOW();",
    "options": {
      "queryReplacement": "={{ $json.user_id }},={{ $json.age }},={{ $json.gender }},={{ $json.height_cm }},={{ $json.weight_kg }},={{ $json.activity_level }},={{ $json.dietary_restrictions }},={{ $json.health_conditions }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Registrar Peso

```json
{
  "node": "Postgres - Log Weight",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO weight_logs (user_id, weight_kg, notes, logged_at, created_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, weight_kg, logged_at;",
    "options": {
      "queryReplacement": "={{ $json.user_id }},={{ $json.weight_kg }},={{ $json.notes || '' }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Obtener Historial de Peso

```json
{
  "node": "Postgres - Weight History",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT weight_kg, notes, logged_at FROM weight_logs WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '$2 days' ORDER BY logged_at ASC;",
    "options": {
      "queryReplacement": "={{ $json.user_id }},={{ $json.days || 30 }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Obtener Plan de Nutricion Activo

```json
{
  "node": "Postgres - Get Meal Plan",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT mp.id, mp.plan_name, mp.description, mp.daily_calories, mp.protein_g, mp.carbs_g, mp.fat_g, mp.meals_json, mp.start_date, mp.end_date, mp.created_at FROM meal_plans mp WHERE mp.user_id = $1 AND mp.is_active = true AND mp.end_date >= CURRENT_DATE ORDER BY mp.created_at DESC LIMIT 1;",
    "options": {
      "queryReplacement": "={{ $json.user_id }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Obtener Plan de Ejercicio Activo

```json
{
  "node": "Postgres - Get Exercise Plan",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT ep.id, ep.plan_name, ep.description, ep.days_per_week, ep.focus_area, ep.difficulty_level, ep.exercises_json, ep.start_date, ep.end_date, ep.created_at FROM exercise_plans ep WHERE ep.user_id = $1 AND ep.is_active = true AND ep.end_date >= CURRENT_DATE ORDER BY ep.created_at DESC LIMIT 1;",
    "options": {
      "queryReplacement": "={{ $json.user_id }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Guardar Log de Conversacion

```json
{
  "node": "Postgres - Save Conversation Log",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO conversation_logs (user_id, message_type, user_message, assistant_response, tokens_used, model, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW());",
    "options": {
      "queryReplacement": "={{ $json.user_id }},={{ $json.message_type }},={{ $json.user_message }},={{ $json.assistant_response }},={{ $json.tokens_used || 0 }},={{ $json.model || 'gpt-4o' }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Verificar Pagos Recientes

```json
{
  "node": "Postgres - Check Recent Payments",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT pl.id, pl.amount, pl.currency, pl.payment_method, pl.status, pl.transaction_id, pl.created_at FROM payment_logs pl INNER JOIN users u ON pl.user_id = u.id WHERE u.telegram_id = $1 ORDER BY pl.created_at DESC LIMIT 5;",
    "options": {
      "queryReplacement": "={{ $json.telegram_id }}"
    }
  },
  "credentials": {
    "postgres": "FitAI PostgreSQL"
  }
}
```

#### Consultas Administrativas

Obtener estadisticas generales del sistema (para el panel de administracion):

```sql
-- Usuarios activos en los ultimos 7 dias
SELECT COUNT(DISTINCT cl.user_id) AS active_users_7d
FROM conversation_logs cl
WHERE cl.created_at >= NOW() - INTERVAL '7 days';

-- Distribucion de objetivos
SELECT g.goal_type, COUNT(*) AS total
FROM goals g
WHERE g.is_active = true
GROUP BY g.goal_type
ORDER BY total DESC;

-- Membresias por estado
SELECT m.status, m.plan_type, COUNT(*) AS total
FROM memberships m
GROUP BY m.status, m.plan_type
ORDER BY m.status, total DESC;

-- Promedio de interacciones por usuario por dia
SELECT DATE(cl.created_at) AS date,
       COUNT(*) / COUNT(DISTINCT cl.user_id)::float AS avg_interactions
FROM conversation_logs cl
WHERE cl.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(cl.created_at)
ORDER BY date DESC;
```

---

## 5. Redis

### Descripcion General

Redis se utiliza como almacen de datos en memoria para gestionar estados temporales y limites de frecuencia. Sus dos casos de uso principales son el manejo del estado del flujo de onboarding y el rate limiting por usuario para proteger los recursos del sistema.

### Configuracion de la Credencial en n8n

```json
{
  "credentialType": "redis",
  "name": "FitAI Redis",
  "data": {
    "host": "${REDIS_HOST}",
    "port": 6379,
    "password": "${REDIS_PASSWORD}",
    "database": 0
  }
}
```

### Key Patterns

#### `onboarding:{telegram_id}` - Estado de Onboarding

Almacena el estado del proceso de onboarding de usuarios nuevos. Tiene un TTL de 24 horas para que el onboarding no completado expire automaticamente y el usuario pueda reiniciarlo.

**TTL:** 86400 segundos (24 horas)

Estructura del valor (JSON serializado):

```json
{
  "step": "awaiting_weight",
  "data": {
    "age": 28,
    "gender": "male",
    "height_cm": 178
  },
  "started_at": "2026-03-26T10:00:00Z",
  "last_updated": "2026-03-26T10:05:30Z"
}
```

Pasos del onboarding y sus transiciones:

| Step | Descripcion | Siguiente Step |
|------|-------------|----------------|
| `awaiting_age` | Esperando que el usuario ingrese su edad | `awaiting_gender` |
| `awaiting_gender` | Esperando seleccion de genero | `awaiting_height` |
| `awaiting_height` | Esperando estatura en cm | `awaiting_weight` |
| `awaiting_weight` | Esperando peso en kg | `awaiting_activity_level` |
| `awaiting_activity_level` | Esperando nivel de actividad fisica | `awaiting_goal` |
| `awaiting_goal` | Esperando seleccion de objetivo | `awaiting_restrictions` |
| `awaiting_restrictions` | Esperando restricciones alimenticias | `completed` |
| `completed` | Onboarding finalizado | Se guarda perfil en PostgreSQL y se elimina la key |

#### `rate_limit:{telegram_id}` - Rate Limiting

Controla la frecuencia de mensajes por usuario para evitar abuso y controlar costos de API. Tiene un TTL de 60 segundos y funciona como un contador.

**TTL:** 60 segundos

Estructura: valor entero que representa el numero de mensajes enviados en la ventana de 60 segundos.

| Condicion | Accion |
|-----------|--------|
| Key no existe | Crear con valor `1` y TTL de 60s |
| Valor < 10 | Incrementar y procesar mensaje |
| Valor >= 10 | Rechazar mensaje y notificar al usuario |

### Nodo Redis en n8n

n8n incluye un nodo nativo de Redis que soporta las operaciones basicas: GET, SET, DELETE, INCR, entre otras.

#### Leer Estado de Onboarding

```json
{
  "node": "Redis - Get Onboarding State",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "get",
    "key": "=onboarding:{{ $json.from.id }}"
  },
  "credentials": {
    "redis": "FitAI Redis"
  }
}
```

#### Guardar/Actualizar Estado de Onboarding

```json
{
  "node": "Redis - Set Onboarding State",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "set",
    "key": "=onboarding:{{ $json.telegram_id }}",
    "value": "={{ JSON.stringify({ step: $json.next_step, data: $json.onboarding_data, started_at: $json.started_at || $now.toISO(), last_updated: $now.toISO() }) }}",
    "expire": true,
    "ttl": 86400
  },
  "credentials": {
    "redis": "FitAI Redis"
  }
}
```

#### Eliminar Estado de Onboarding (Al Completar)

```json
{
  "node": "Redis - Delete Onboarding State",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "delete",
    "key": "=onboarding:{{ $json.telegram_id }}"
  },
  "credentials": {
    "redis": "FitAI Redis"
  }
}
```

#### Verificar Rate Limit

La verificacion del rate limit se implementa con una combinacion de operaciones INCR y verificacion del valor:

```json
{
  "node": "Redis - Increment Rate Limit",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "incr",
    "key": "=rate_limit:{{ $json.from.id }}"
  },
  "credentials": {
    "redis": "FitAI Redis"
  }
}
```

Despues del INCR, se establece el TTL solo si es una key nueva (valor = 1):

```json
{
  "node": "IF - Is New Rate Limit Key",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "number": [
        {
          "value1": "={{ $json.result }}",
          "operation": "equal",
          "value2": 1
        }
      ]
    }
  }
}
```

```json
{
  "node": "Redis - Set Rate Limit TTL",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "set",
    "key": "=rate_limit:{{ $json.telegram_id }}",
    "value": "=1",
    "expire": true,
    "ttl": 60
  },
  "credentials": {
    "redis": "FitAI Redis"
  }
}
```

Verificacion del limite:

```json
{
  "node": "IF - Rate Limit Exceeded",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "number": [
        {
          "value1": "={{ $json.result }}",
          "operation": "largerEqual",
          "value2": 10
        }
      ]
    }
  }
}
```

Cuando se excede el limite, se envia un mensaje al usuario:

```json
{
  "node": "Telegram - Rate Limit Message",
  "parameters": {
    "chatId": "={{ $json.chat_id }}",
    "text": "Has enviado demasiados mensajes en poco tiempo. Por favor espera un momento antes de enviar otro mensaje.",
    "additionalFields": {
      "parse_mode": "Markdown"
    }
  }
}
```

### Flujo Completo del Onboarding con Redis

El flujo de onboarding utiliza Redis como maquina de estados. Cada vez que el usuario envia un mensaje durante el onboarding:

1. **Verificar si existe key** `onboarding:{telegram_id}` en Redis.
2. **Si no existe**: el usuario no esta en onboarding. Verificar si tiene perfil en PostgreSQL.
   - Si no tiene perfil: crear key en Redis con `step: "awaiting_age"` e iniciar el flujo.
   - Si tiene perfil: procesar el mensaje normalmente con el agente de IA.
3. **Si existe**: leer el `step` actual y procesar la respuesta del usuario segun corresponda.
4. **Validar la respuesta**: verificar que el dato ingresado sea valido (edad numerica entre 12-100, peso entre 30-300 kg, etc.).
5. **Actualizar el estado**: guardar el dato validado en `data` y avanzar al siguiente `step`.
6. **Si `step` es `completed`**: guardar todo el perfil en PostgreSQL, eliminar la key de Redis y enviar mensaje de bienvenida con el resumen del perfil.

Configuracion del nodo Switch para el onboarding:

```json
{
  "node": "Switch - Onboarding Step",
  "type": "n8n-nodes-base.switch",
  "parameters": {
    "dataType": "string",
    "value1": "={{ $json.onboarding_state.step }}",
    "rules": {
      "rules": [
        { "value2": "awaiting_age", "output": 0 },
        { "value2": "awaiting_gender", "output": 1 },
        { "value2": "awaiting_height", "output": 2 },
        { "value2": "awaiting_weight", "output": 3 },
        { "value2": "awaiting_activity_level", "output": 4 },
        { "value2": "awaiting_goal", "output": 5 },
        { "value2": "awaiting_restrictions", "output": 6 }
      ]
    }
  }
}
```

---

## Variables de Entorno Requeridas

Resumen de todas las variables de entorno referenciadas en las integraciones:

| Variable | Servicio | Descripcion |
|----------|----------|-------------|
| `BOT_TOKEN` | Telegram | Token del bot obtenido de BotFather |
| `DOMAIN` | n8n | Dominio publico donde corre n8n (para el webhook) |
| `OPENAI_API_KEY` | OpenAI | API key de la plataforma de OpenAI |
| `OPENAI_ORG_ID` | OpenAI | ID de la organizacion en OpenAI (opcional) |
| `QDRANT_API_KEY` | Qdrant | API key de la instancia de Qdrant |
| `POSTGRES_HOST` | PostgreSQL | Host del servidor PostgreSQL |
| `POSTGRES_USER` | PostgreSQL | Usuario de la base de datos |
| `POSTGRES_PASSWORD` | PostgreSQL | Contrasena del usuario de la base de datos |
| `REDIS_HOST` | Redis | Host del servidor Redis |
| `REDIS_PASSWORD` | Redis | Contrasena de Redis (si aplica) |
