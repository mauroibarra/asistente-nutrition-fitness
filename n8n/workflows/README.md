# Workflows de n8n — FitAI Assistant

19 workflows activos que implementan toda la lógica del bot: desde recibir un mensaje de Telegram hasta generar planes personalizados con GPT-4o, registrar comidas, calcular progreso y enviar mensajes proactivos.

---

## Mapa de Workflows

```mermaid
graph TB
    subgraph Entrada["Entrada (Tiempo real)"]
        W01["01 · Telegram Webhook Handler\nPuerto de entrada único"]
        W02["02 · Process Text Message\nDebounce multi-mensaje"]
    end

    subgraph OnboardingCore["Onboarding + Agente Core"]
        W03["03 · Onboarding Flow\nRedis state machine"]
        MAI["Main AI Agent\nGPT-4o + memoria"]
    end

    subgraph ToolsIA["Herramientas del Agente IA"]
        W04["04 · Meal Plan Generator"]
        W07["07 · Progress Calculator"]
        W08["08 · Workout Plan Generator"]
        W13["13 · Log Food Intake"]
        W14["14 · Get Daily Status"]
        W15["15 · Daily Plan Generator"]
    end

    subgraph Proactivos["Proactivos (Cron)"]
        W05["05 · Meal Reminder · 3×/día"]
        W06["06 · Weight Update · semanal"]
        W10["10 · Membership Alert · diario"]
        W16["16 · Morning Briefing · 7am"]
        W17["17 · Evening Check-in · 9pm"]
        W18["18 · Weekly Report · domingo"]
        W19["19 · Silence Detector · diario"]
    end

    subgraph RAG["RAG / Indexación"]
        W09["09 · RAG Personal Indexer"]
        W11["11 · Knowledge Base Indexer"]
    end

    W01 -->|"texto/voz"| W02 --> MAI
    W01 -->|"nuevo usuario"| W03
    MAI --> W04 & W07 & W08 & W13 & W14 & W15
    MAI --> W09

    style Entrada fill:#0088cc,color:#fff
    style OnboardingCore fill:#10a37f,color:#fff
    style ToolsIA fill:#667eea,color:#fff
    style Proactivos fill:#ed8936,color:#fff
    style RAG fill:#9f7aea,color:#fff
```

---

## Lista de Workflows

| # | Nombre | ID | Trigger | Estado |
|---|--------|----|---------|--------|
| 01 | `FitAI - Telegram Webhook Handler` | `fI5u4rs3iXPfeXFl` | `telegramTrigger` | Activo |
| 02 | `FitAI - Process Text Message` | `CCkMv75zwDDoj513` | executeWorkflow | Activo |
| 03 | `FitAI - Onboarding Flow` | `yiUgnJ6gCoaIFVXe` | executeWorkflow | Activo |
| 04 | `FitAI - Meal Plan Generator` | `KQhP9lQNxCKeOsbJ` | toolWorkflow | Activo |
| 05 | `FitAI - Meal Reminder Scheduler` | `SntGuE97yl9efvo5` | Cron (3×/día) | Activo |
| 06 | `FitAI - Weight Update Requester` | `tkSAHhjJnO4nTFsM` | Cron (semanal) | Activo |
| 07 | `FitAI - Progress Calculator` | `bhJ8qqZXr68Id3pH` | toolWorkflow | Activo |
| 08 | `FitAI - Workout Plan Generator` | `ETjiYAUhXfsVSyWQ` | toolWorkflow | Activo |
| 09 | `FitAI - RAG Personal Indexer` | `vAqqjXg2IE1ldgg3` | executeWorkflow | Activo |
| 10 | `FitAI - Membership Alert` | `I4Q4C6SOPY2fnK3W` | Cron (diario) | Activo |
| 11 | `FitAI - Knowledge Base Indexer` | `3uXT5ld76uIUCENn` | Manual | Activo |
| 13 | `FitAI - Log Food Intake` | `DQsnzXQWMSqJxigL` | toolWorkflow | Activo |
| 14 | `FitAI - Get Daily Status` | `J2y4wKYEugHe4Mkg` | toolWorkflow | Activo |
| 15 | `FitAI - Daily Plan Generator Cron` | `xILhDSQy0ZP40jjt` | Cron (9pm) | Activo |
| 16 | `FitAI - Morning Briefing` | `NFhsChTrhIc05uyc` | Cron (7am) | Activo |
| 17 | `FitAI - Evening Check-in` | `ErIUGcIkS5Rim65L` | Cron (9pm) | Activo |
| 18 | `FitAI - Weekly Report` | `gsIQcXRlMznc3uJ8` | Cron (domingo) | Activo |
| 19 | `FitAI - Silence Detector` | `ytuz6H8cdBm8oyTx` | Cron (diario) | Activo |

---

## Flujo del Webhook Handler (Workflow 01)

El corazón del sistema. Recibe cada mensaje de Telegram y lo enruta.

```mermaid
flowchart TD
    TG["📨 Telegram Webhook"] --> SW{Tipo de\nmensaje}

    SW -->|"🎤 voice"| VF["Get Voice File"]
    SW -->|"💬 text"| PT["Call Process Text Message\n(debounce 2s)"]

    VF --> TR["Transcribe\n(Whisper API)"] --> SV["Set Text from Voice"]
    PT --> SUC
    SV --> SUC["Set User Context\n{chatId · telegramId · message.text}"]

    SUC --> UU["Upsert User\n(PostgreSQL ON CONFLICT)"]
    UU --> CM["Check User & Membership\n(JOIN users + memberships)"]
    CM --> IM{¿Membresía\nactiva?}

    IM -->|"No"| NM["❌ Enviar mensaje\n'Sin suscripción activa'"]
    IM -->|"Sí"| BC["Build Context\n(perfil + metas + estado + RAG)"]
    BC --> IO{¿Onboarding\ncompleto?}

    IO -->|"No"| OF["Llamar Onboarding Flow\n(Redis state machine)"]
    IO -->|"Sí"| AG["🤖 FitAI Main AI Agent\n(GPT-4o + tools + memoria)"]

    AG --> SR["Send Response\n(Telegram API)"]
    SR --> LC["Log Conversation\n(PostgreSQL)"]
    LC --> RI["Trigger RAG Indexer\n(async, sin bloquear)"]

    style TG fill:#0088cc,color:#fff
    style AG fill:#10a37f,color:#fff
    style NM fill:#e53e3e,color:#fff
```

---

## Flujo de Onboarding (Workflow 03)

Recopila el perfil del usuario mediante conversación natural. Estado persistido en Redis con TTL de 48 horas.

```mermaid
stateDiagram-v2
    [*] --> welcome : Usuario sin onboarding
    welcome --> personal_info : Mensaje de bienvenida\n(preguntas en texto libre)
    personal_info --> goals : Nombre · Edad · Sexo\nAltura · Peso actual
    goals --> activity : Objetivo principal\n(perder / ganar / mantener)
    activity --> dietary : Nivel de actividad\n(sedentario → muy activo)
    dietary --> schedule : Restricciones alimentarias\n(vegano, sin gluten, alergias...)
    schedule --> complete : Horario preferido de comidas
    complete --> [*] : ✅ Perfil guardado en DB\nPlan generado automáticamente

    note right of personal_info
        Cada paso se guarda
        en Redis como:
        onboarding:{userId}
        TTL = 48 horas
    end note

    note right of complete
        BMI · TMB · TDEE
        calculados automáticamente
        y guardados en user_profiles
    end note
```

---

## El Agente IA y sus Herramientas

```mermaid
graph LR
    MSG["Mensaje del usuario\n+ contexto completo"] --> AG["🤖 GPT-4o\nMain AI Agent"]

    AG -->|"Genera plan semanal"| T1["📋 Meal Plan Generator\n(WF 04)"]
    AG -->|"Genera rutina de gym"| T2["💪 Workout Plan Generator\n(WF 08)"]
    AG -->|"Calcula BMI/progreso"| T3["📊 Progress Calculator\n(WF 07)"]
    AG -->|"Registra comida consumida"| T4["🍽️ Log Food Intake\n(WF 13)"]
    AG -->|"Muestra resumen del día"| T5["📈 Get Daily Status\n(WF 14)"]
    AG -->|"Genera plan de mañana"| T6["🗓️ Daily Plan Generator\n(WF 15)"]

    AG -->|"Respuesta directa"| RESP["📤 Respuesta\na Telegram"]

    T1 & T2 & T3 & T4 & T5 & T6 --> RESP

    subgraph Memoria["Memoria del Agente"]
        MEM["memoryBufferWindow\nÚltimos 10 mensajes\npor sessionId=telegram_id"]
    end

    AG <--> MEM

    style AG fill:#10a37f,color:#fff
    style Memoria fill:#2d3748,color:#fff
```

---

## Workflows Proactivos (Cron)

```mermaid
gantt
    title Workflows Proactivos — Horario diario (hora Colombia)
    dateFormat HH:mm
    axisFormat %H:%M

    section Mañana
    Morning Briefing (WF 16)    :07:00, 30m
    Daily Plan Generator (WF 15):21:00, 30m

    section Recordatorios
    Meal Reminder — Desayuno (WF 05)  :08:00, 15m
    Meal Reminder — Almuerzo (WF 05)  :12:30, 15m
    Meal Reminder — Cena (WF 05)      :19:00, 15m

    section Noche
    Evening Check-in (WF 17)    :21:00, 30m

    section Fondo
    Membership Alert (WF 10)    :06:00, 15m
    Silence Detector (WF 19)    :10:00, 15m
```

**Weekly Report (WF 18)** corre los domingos a las 9am con resumen de la semana.
**Weight Update Requester (WF 06)** corre los lunes a las 8am solicitando el peso actual.

---

## Sistema RAG — Contexto Inteligente

```mermaid
flowchart LR
    subgraph Indexación["Indexación automática post-conversación"]
        CV["Conversación\ncompletada"]
        RP["Build RAG Payload\n{userId, eventType, texto}"]
        RI["RAG Personal\nIndexer (WF 09)"]
        QD[("Qdrant\nuser_rag")]
    end

    subgraph Conocimiento["Base de conocimiento indexada"]
        KB["knowledge_rag\n106 puntos\n(nutrition · fitness · hábitos · métricas)"]
    end

    subgraph Recuperación["Recuperación en cada mensaje"]
        MSG["Nuevo mensaje"] --> EMB["Embedding\n(text-embedding-3-small)"]
        EMB --> SRH["Búsqueda semántica\n(cosine similarity)"]
        SRH <-->|"user_rag"| QD
        SRH <-->|"knowledge_rag"| KB
        SRH --> CTX["Contexto relevante\ninyectado al agente"]
    end

    CV --> RP --> RI --> QD

    style QD fill:#9f7aea,color:#fff
    style KB fill:#9f7aea,color:#fff
```

---

## Patrones Críticos de Implementación

### Debounce multi-mensaje (Workflow 02)

Cuando el usuario envía varios mensajes seguidos rápido, el sistema espera a que termine de escribir:

```
Usuario: "hola"
Usuario: "quiero saber"
Usuario: "cuántas calorías tiene una pizza"
         ↓ (2 segundos sin mensajes)
Sistema: toma el último y responde una sola vez
```

Implementado con `INSERT ... ON CONFLICT ... GREATEST(last_ts)` + DELETE atómico.

### Contexto de usuario en el agente

Antes de cada respuesta, el agente recibe:
- Perfil (edad, sexo, peso, altura, objetivo)
- Targets del día (calorías, proteínas, carbos, grasas)
- Progreso del día (consumido vs. objetivo)
- Plan de comidas activo
- Historial reciente (memoria buffer)
- Contexto RAG relevante

### Timezone — America/Bogota en todo

```javascript
// Correcto — siempre usar:
new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// En SQL — siempre usar:
(NOW() AT TIME ZONE 'America/Bogota')::date
```

---

## Archivos JSON de Workflows

```
n8n/workflows/
├── README.md                              # Este archivo
├── 01-telegram-webhook-handler.json
├── 02-process-text-message.json
├── 03-onboarding-flow.json
├── 04-meal-plan-generator.json
├── 05-meal-reminder-scheduler.json
├── 06-weight-update-requester.json
├── 07-progress-calculator.json
├── 08-workout-plan-generator.json
├── 09-rag-personal-indexer.json
├── 10-membership-alert.json
├── 11-knowledge-base-indexer.json
├── 13-log-food-intake.json
├── 14-get-daily-status.json
├── 15-daily-plan-generator-cron.json
├── 16-morning-briefing.json
├── 17-evening-checkin.json
├── 18-weekly-report.json
└── 19-silence-detector.json
```

---

## Credenciales Necesarias en n8n

| Credencial | Tipo en n8n | Usada por |
|-----------|------------|-----------|
| OpenAI | OpenAI API | AI Agent, Meal Plan, Workout, RAG, embeddings |
| Telegram Bot | Telegram API | Webhook Handler, cron workflows |
| PostgreSQL | Postgres | Todos los workflows |
| Redis | Redis | Onboarding (state), debounce |
| Qdrant | HTTP Header Auth | RAG Personal Indexer, Main AI Agent |

Configurar en n8n: **Settings → Credentials → Add Credential**.
Las credenciales se almacenan encriptadas con `N8N_ENCRYPTION_KEY` — nunca en los archivos JSON.

---

## Orden de Importación

```
1. Primero (sin dependencias):
   WF 04 · 07 · 08 · 09 · 11 · 13 · 14 · 15

2. Segundo (tools del agente):
   WF 02 · 03

3. Tercero (agente central):
   Main AI Agent (integrado en WF 01)

4. Último (punto de entrada + crons):
   WF 01 · 05 · 06 · 10 · 16 · 17 · 18 · 19
```

---

## Testing Local

```bash
# Simular mensaje de Telegram al handler
curl -X POST http://localhost:5678/webhook-test/fitai-telegram \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456,
    "message": {
      "message_id": 1,
      "from": { "id": 1435522255, "first_name": "Mauro" },
      "chat": { "id": 1435522255, "type": "private" },
      "date": 1700000000,
      "text": "¿Cómo va mi progreso esta semana?"
    }
  }'
```

Usuario de prueba con chat real: `telegram_id = 1435522255`, `user_id = 212` en DB.
