# Handlers del Bot de Telegram — FitAI Assistant

El bot **no tiene handlers en código tradicional**. Toda la lógica de manejo de mensajes está en workflows de n8n. Este directorio documenta la arquitectura lógica y su implementación en n8n.

---

## Flujo Completo de un Mensaje

```mermaid
sequenceDiagram
    participant U as Usuario
    participant TG as Telegram API
    participant NGX as Nginx
    participant N8N as n8n Handler
    participant PG as PostgreSQL
    participant AI as GPT-4o

    U->>TG: Envía mensaje (texto/voz/botón)
    TG->>NGX: POST /webhook/fitai-telegram\n(HTTPS + secret token)
    NGX->>N8N: Reenvía el update
    N8N->>N8N: Determina tipo de mensaje
    N8N->>PG: Upsert usuario + verificar membresía
    alt Sin membresía activa
        N8N->>TG: Mensaje de suscripción
        TG->>U: "Para continuar necesitas..."
    else Membresía activa
        N8N->>PG: Carga contexto completo del usuario
        N8N->>AI: Mensaje + contexto + herramientas
        AI->>N8N: Respuesta o llamada a tool
        N8N->>PG: Guarda log de conversación
        N8N->>TG: Envía respuesta
        TG->>U: Respuesta del asistente
    end
```

---

## Tipos de Mensaje Manejados

```mermaid
flowchart TD
    MSG["Telegram Update"] --> SW{Tipo}

    SW -->|"message.voice"| V["🎤 Mensaje de Voz\nTranscripción con Whisper API\n→ continúa como texto"]

    SW -->|"message.text"| T["💬 Texto\nProceso de debounce\n(espera 2s por mensajes múltiples)"]

    SW -->|"callback_query"| C["🔘 Botón presionado\nLee callback_data del botón\n→ continúa como texto"]

    V & T & C --> UC["Set User Context\n{chatId · telegramId · message.text · firstName}"]
    UC --> VER["Verificar usuario + membresía"]
    VER --> RT{¿Onboarding?}

    RT -->|"Incompleto"| ON["Onboarding Flow\nRedis state machine"]
    RT -->|"Completo"| AG["Main AI Agent\nGPT-4o + tools + memoria"]

    style MSG fill:#0088cc,color:#fff
    style AG fill:#10a37f,color:#fff
    style ON fill:#ed8936,color:#fff
```

---

## Handlers Lógicos

### Comandos de Telegram

| Comando | Acción | Implementado en |
|---------|--------|----------------|
| `/start` | Inicia onboarding (nuevo) o saluda (existente) | WF 03 - Onboarding Flow |
| `/plan` | Muestra plan de comidas o ejercicio activo | WF 01 → GPT-4o tool |
| `/progreso` | Calcula y muestra progreso actual | WF 07 - Progress Calculator |
| `/ayuda` | Mensaje de ayuda con comandos disponibles | WF 01 - respuesta directa |

### Texto Libre

Cualquier texto que no sea un comando va directamente al agente GPT-4o:

- Conversación sobre nutrición y fitness
- "comí una pizza margarita al almuerzo" → registra en log
- "¿cómo voy con mis calorías?" → consulta Daily Status
- "quiero un plan de comidas para esta semana" → genera Meal Plan
- "estoy desmotivado" → respuesta de coaching personalizada

### Voz

El mensaje de voz se transcribe con Whisper API y luego se trata como texto. El usuario puede hablar naturalmente y el bot entiende.

### Botones Inline (callback_query)

Usados principalmente durante el onboarding para opciones rápidas:

```
[Perder peso] [Ganar músculo] [Mantenerme]
[Sedentario] [Poco activo] [Moderado] [Muy activo]
```

Cada botón envía un `callback_data` que el handler lee y procesa como respuesta de texto.

---

## Verificaciones Pre-Handler

Antes de ejecutar cualquier lógica, el handler verifica en orden:

```mermaid
flowchart LR
    A["Mensaje recibido"] --> B["¿Usuario existe?\n(tabla users)"]
    B -->|"No"| C["Crear usuario\n(INSERT ON CONFLICT)"]
    B & C --> D["¿Membresía activa?\n(status='active' AND expires_at > NOW())"]
    D -->|"No"| E["❌ Mensaje: activa tu suscripción"]
    D -->|"Sí"| F["✅ Procesar mensaje"]

    style E fill:#e53e3e,color:#fff
    style F fill:#10a37f,color:#fff
```

No hay verificación de rate limit individual por mensaje — el debounce de 2 segundos actúa como throttle natural.

---

## Nodos n8n que implementan los handlers

| Nodo n8n | Función del handler |
|---------|-------------------|
| `telegramTrigger` | Recibe el HTTP POST de Telegram |
| `Switch` | Determina tipo (voice / text / callback_query) |
| `Get Voice File` + Whisper | Transcripción de audio |
| `executeWorkflow` → WF 02 | Debounce multi-mensaje |
| `Set User Context` | Normaliza {chatId, telegramId, message.text} |
| `Postgres` (upsert) | Crea/actualiza usuario |
| `Postgres` (check) | Verifica membresía activa |
| `IF` → WF 03 | Enruta a onboarding si incompleto |
| `AI Agent` (GPT-4o) | Procesa mensaje con contexto |
| `Telegram Send` | Envía respuesta al usuario |

Documentación detallada de cada workflow: `docs/n8n-flows.md`

---

## Futuro: Handlers en Código

Si en fases futuras se necesita lógica que supere las capacidades de un Code node de n8n (ej: procesamiento de imágenes pesado, cálculos en tiempo real muy complejos), se podrían agregar microservicios HTTP en este directorio que n8n invoca via HTTP Request node.

```
src/bot/handlers/
├── README.md           # Este archivo
├── imageAnalysis.js    # (futuro) Análisis visual de fotos de comida
└── complexCalc.js      # (futuro) Cálculos que excedan Code node
```
