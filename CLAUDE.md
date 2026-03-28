# FitAI Assistant — Instrucciones para Claude Code

## Descripción del Proyecto

**FitAI Assistant** es un asistente personal de salud y fitness por suscripción mensual que opera en Telegram. Ayuda a los usuarios a perder o ganar peso, mejorar su alimentación y construir rutinas de ejercicio mediante conversaciones naturales con un agente de IA.

El sistema tiene dos partes:
1. **Bot de Telegram** — cara al usuario final, impulsado por agentes de OpenAI (GPT-4o) dentro de n8n
2. **Panel de administración web** — cara interna (Express + EJS), para gestionar usuarios, membresías y pagos

---

## Separación Crítica de Roles

| Rol | Tecnología | Contexto |
|-----|-----------|----------|
| **LLM en producción** | OpenAI GPT-4o | Corre dentro de nodos AI Agent de n8n. Genera respuestas para los usuarios en Telegram. |
| **Herramienta de desarrollo** | Claude Code | Genera código, documentación, workflows. NUNCA interactúa con usuarios finales en producción. |

**NUNCA confundir estos roles.** Claude Code no reemplaza a OpenAI en producción. OpenAI no se usa para tareas de desarrollo.

---

## Stack Tecnológico

| Componente | Tecnología | Versión Recomendada |
|-----------|-----------|-------------------|
| Agentes de IA (runtime) | OpenAI API (GPT-4o) | Última estable |
| Embeddings | OpenAI text-embedding-3-small | Última estable |
| Orquestación | n8n self-hosted | 2.11.3 (standalone Docker, SQLite) |
| Canal | Telegram Bot API | v6+ |
| Base de datos | PostgreSQL | 16 |
| Caché | Redis | 7 |
| Vector store | Qdrant | 1.7+ |
| Panel admin | Express + EJS | Express 4.x, EJS 3.x |
| Infraestructura | Docker Compose | 2.x |
| Reverse proxy | Nginx | 1.25+ |
| OS servidor | Ubuntu | 22.04 LTS |

---

## Estructura del Proyecto

```
asistente-nutrition-fitness/
├── CLAUDE.md                    # Este archivo — instrucciones para Claude Code
├── README.md                    # Documentación pública del proyecto
├── .mcp.json                    # Configuración de MCPs para Claude Code
├── .env.example                 # Variables de entorno (plantilla)
├── docker-compose.yml           # Stack completo de servicios
├── infra/
│   └── nginx.conf               # Configuración de Nginx reverse proxy
├── docs/
│   ├── architecture.md          # Arquitectura técnica con diagramas
│   ├── data-models.md           # Modelos de datos, SQL, ER, JSONs de ejemplo
│   ├── n8n-flows.md             # Documentación de los 10 workflows de n8n
│   ├── api-integrations.md      # Integraciones externas (Telegram, OpenAI, Qdrant, etc.)
│   ├── admin-panel.md           # Documentación del panel de administración
│   ├── deployment.md            # Guía de despliegue en VPS
│   └── project-status.md        # Estado actual y próximos pasos
├── skills/
│   ├── dev/                     # Skills de DESARROLLO — uso exclusivo de Claude Code
│   │   ├── n8n-workflow-debugging.md  # Debugging de workflows n8n: causas raíz + checklist
│   │   └── n8n-ai-agent-tools.md     # Patrones AI Agent + toolWorkflow: fields.values, $fromAI
│   └── business/                # Skills de NEGOCIO — base de conocimiento del agente OpenAI
│       ├── nutrition.md         # Nutrición: fórmulas, macros, restricciones, alertas
│       ├── fitness.md           # Fitness: principios, rutinas completas, recuperación
│       ├── habit-psychology.md  # Psicología del hábito: coaching, meseta, motivación
│       └── metrics-calculation.md # Métricas: 9 funciones JS (BMI, TMB, progreso, etc.)
├── prompts/
│   ├── system-prompt.md         # System prompt del agente OpenAI
│   ├── onboarding.md            # Flujo completo de onboarding
│   ├── meal-plan-generation.md  # Templates de generación de planes de comidas
│   └── workout-plan-generation.md # Templates de generación de rutinas
├── n8n/
│   └── workflows/
│       └── README.md            # Guía de workflows de n8n
├── admin-panel/
│   └── README.md                # Instrucciones del panel admin
└── src/
    └── bot/
        └── handlers/
            └── README.md        # Descripción de handlers del bot
```

---

## Comandos Frecuentes de Desarrollo

### Setup Inicial Completo

```bash
# 1. Clonar el repositorio
git clone <repo-url> asistente-nutrition-fitness
cd asistente-nutrition-fitness

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con los valores reales

# 3. Levantar todos los servicios
docker compose up -d

# 4. Verificar que todos los servicios están corriendo
docker compose ps

# 5. Acceder a n8n para configuración inicial
# Abrir http://localhost:5678 en el navegador
```

### Iniciar n8n en Local

```bash
# Levantar solo n8n con sus dependencias
docker compose up -d n8n postgres redis qdrant

# Ver logs de n8n
docker compose logs -f n8n

# Reiniciar n8n después de cambios
docker compose restart n8n
```

### Importar/Exportar Workflows de n8n

```bash
# Exportar todos los workflows
docker compose exec n8n n8n export:workflow --all --output=/home/node/backups/workflows.json

# Importar workflows desde archivo
docker compose exec n8n n8n import:workflow --input=/home/node/backups/workflows.json

# Exportar credenciales (para backup, no compartir)
docker compose exec n8n n8n export:credentials --all --output=/home/node/backups/credentials.json
```

### Migraciones de Base de Datos

```bash
# Conectar a PostgreSQL
docker compose exec postgres psql -U fitai -d fitai_db

# Ejecutar un archivo de migración
docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/001_initial_schema.sql

# Verificar estado de las tablas
docker compose exec postgres psql -U fitai -d fitai_db -c "\dt"
```

### Indexar Documentos en Qdrant

```bash
# Verificar que Qdrant está corriendo
curl http://localhost:6333/collections

# Crear colecciones (ejecutar una vez)
curl -X PUT http://localhost:6333/collections/knowledge_rag \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": { "size": 1536, "distance": "Cosine" }
  }'

curl -X PUT http://localhost:6333/collections/user_rag \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": { "size": 1536, "distance": "Cosine" }
  }'
```

### Deploy a Producción

```bash
# En el servidor VPS
cd /opt/fitai

# Pull de cambios
git pull origin main

# Rebuild y restart
docker compose pull
docker compose up -d --build

# Verificar estado
docker compose ps
docker compose logs --tail=50
```

---

## Configuración de MCPs

Los MCPs (Model Context Protocols) permiten a Claude Code interactuar directamente con los servicios del proyecto. La configuración está en `.mcp.json` en la raíz del proyecto.

### n8n-mcp

Permite crear, editar y ejecutar workflows de n8n sin abrir la UI:

```bash
# Listar workflows
# → usa n8n-mcp tool: list_workflows

# Crear un workflow nuevo
# → usa n8n-mcp tool: create_workflow con el JSON del workflow

# Activar/desactivar un workflow
# → usa n8n-mcp tool: activate_workflow / deactivate_workflow
```

**Repositorio**: https://github.com/czlonkowski/n8n-mcp

### Filesystem MCP

Permite leer y escribir archivos del proyecto directamente.

### PostgreSQL MCP

Permite ejecutar queries directos a la base de datos durante el desarrollo:

```bash
# Consultar usuarios
# → usa postgres MCP: query "SELECT * FROM users LIMIT 10"

# Ver estructura de una tabla
# → usa postgres MCP: query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'"
```

---

## Uso del Skill Repository de n8n

El repositorio https://github.com/czlonkowski/n8n-skills contiene patrones y skills reutilizables para n8n. Para usarlos:

1. Revisar los templates disponibles en el repositorio
2. Identificar patrones aplicables (AI Agent, Telegram bot, scheduled tasks)
3. Adaptar los templates a las necesidades de FitAI
4. Importar en n8n via la UI o via n8n-mcp

---

## Convenciones del Proyecto

### Naming de Archivos
- Documentación: `kebab-case.md` (ej: `data-models.md`)
- Código fuente: `camelCase.js` o `kebab-case.js` según contexto
- Variables de entorno: `UPPER_SNAKE_CASE`

### Estructura de Workflows de n8n
- Prefijo: `FitAI - ` seguido del nombre descriptivo
- Los 8 workflows del sistema (Main AI Agent y Onboarding Flow están integrados en el Handler):
  1. `FitAI - Telegram Webhook Handler` — punto de entrada, AI Agent integrado
  2. `FitAI - Progress Calculator` — tool llamada por el AI Agent
  3. `FitAI - Meal Plan Generator` — tool llamada por el AI Agent
  4. `FitAI - Workout Plan Generator` — tool llamada por el AI Agent
  5. `FitAI - RAG Personal Indexer` — indexación de datos del usuario en Qdrant
  6. `FitAI - Meal Reminder Scheduler` — cron diario
  7. `FitAI - Weight Update Requester` — cron semanal
  8. `FitAI - Membership Alert` — cron de alertas de membresía

### Variables de Entorno
- Nunca hardcodear credenciales en el código
- Todas las keys van en `.env`
- Las credenciales de n8n se configuran dentro de n8n, separadas del código
- Usar `.env.example` como referencia (sin valores reales)

---

## Flujo de Trabajo Recomendado

### Desarrollo con Claude Code + n8n

1. **Diseñar** el workflow en `docs/n8n-flows.md` primero
2. **Crear** el workflow usando n8n-mcp o la public API de n8n
3. **Configurar** credenciales en la UI de n8n (las credenciales no se pueden crear via MCP)
4. **Probar** el workflow en n8n (modo manual o webhook de prueba)
5. **Iterar** modificaciones via public API con el ciclo correcto (ver abajo)
6. **Exportar** el workflow final y guardarlo en `n8n/workflows/`

### Ciclo obligatorio para actualizar un workflow activo con webhook

Un simple PUT/PATCH no actualiza el handler en ejecución. Siempre usar este ciclo:

```python
import urllib.request, json, time

BASE = "http://localhost:5678"
API_KEY = "..."  # X-N8N-API-KEY

def update_workflow(wf_id, payload):
    headers = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}
    # 1. Desactivar
    urllib.request.urlopen(urllib.request.Request(
        f"{BASE}/api/v1/workflows/{wf_id}/deactivate", data=b'{}', headers=headers, method="POST"))
    # 2. Guardar
    urllib.request.urlopen(urllib.request.Request(
        f"{BASE}/api/v1/workflows/{wf_id}", data=json.dumps(payload).encode(), headers=headers, method="PUT"))
    # 3. Reactivar
    time.sleep(1)
    urllib.request.urlopen(urllib.request.Request(
        f"{BASE}/api/v1/workflows/{wf_id}/activate", data=b'{}', headers=headers, method="POST"))
```

### Desarrollo del Panel Admin

1. Escribir el código en `admin-panel/`
2. Probar localmente con `docker compose up admin-panel`
3. Verificar la conexión con PostgreSQL
4. Probar flujos CRUD completos

---

## Skills — Cuándo y Cómo Usarlas

Los skills están divididos en dos categorías con propósitos distintos. **Claude Code DEBE leer el skill correspondiente antes de ejecutar cada tipo de tarea.**

### Skills de Desarrollo — `skills/dev/`

Uso exclusivo de Claude Code durante el desarrollo. No llegan al agente OpenAI en producción.

| Skill | Cuándo leerlo OBLIGATORIAMENTE |
|-------|-------------------------------|
| [`skills/dev/n8n-workflow-debugging.md`](skills/dev/n8n-workflow-debugging.md) | Antes de modificar cualquier workflow de n8n. Antes de diagnosticar un error en una ejecución. Antes de cambiar la forma en que se actualiza un workflow activo. |
| [`skills/dev/n8n-ai-agent-tools.md`](skills/dev/n8n-ai-agent-tools.md) | Antes de crear o modificar nodos `toolWorkflow`. Antes de cambiar cómo el AI Agent pasa datos a sub-workflows. Antes de configurar `fields.values` o `$fromAI()`. |

**Regla:** Si vas a tocar n8n y no has leído el skill correspondiente en esta sesión, léelo primero.

---

### Skills de Negocio — `skills/business/`

Base de conocimiento del dominio. Son los documentos que el agente OpenAI en producción usa para generar respuestas correctas. Claude Code los usa para:
- Generar o revisar prompts del sistema
- Diseñar flujos de onboarding
- Validar que los planes generados son coherentes con las reglas del negocio
- Indexar en Qdrant (`knowledge_rag`) para RAG

| Skill | Cuándo usarlo |
|-------|--------------|
| [`skills/business/nutrition.md`](skills/business/nutrition.md) | Al escribir o revisar prompts de planes de comidas. Al validar cálculos calóricos. Al diseñar el onboarding nutricional. Al indexar en Qdrant. |
| [`skills/business/fitness.md`](skills/business/fitness.md) | Al escribir o revisar prompts de rutinas de ejercicio. Al validar que las rutinas generadas sean seguras y coherentes con el nivel del usuario. |
| [`skills/business/habit-psychology.md`](skills/business/habit-psychology.md) | Al diseñar mensajes de motivación, recordatorios y respuestas ante abandono. Al revisar el tono del system prompt. |
| [`skills/business/metrics-calculation.md`](skills/business/metrics-calculation.md) | Al implementar o revisar el nodo de cálculo de progreso. Al validar fórmulas de BMI, TMB, deficit calórico y proyecciones de peso. |

**Regla:** Antes de generar un plan de comidas, rutina o respuesta sobre progreso, leer el skill de negocio correspondiente para garantizar coherencia con las reglas del dominio.

---

## Patrones Críticos de n8n (Lecciones Aprendidas)

Antes de modificar cualquier workflow, consultar `skills/n8n-workflow-debugging.md` y `skills/n8n-ai-agent-tools.md`. Resumen de los puntos más críticos:

### toolWorkflow — inyección de contexto
Para pasar `userId`, `chatId` u otro contexto del developer a sub-workflows, usar **typeVersion 1.3** con `fields.values`:
```json
{ "name": "userId", "type": "numberValue", "numberValue": "={{ $('Check User & Membership').item.json.user_id }}" }
```
**NO** usar `workflowInputs.schema` de typeVersion 2 para esto.

### $json apunta al nodo ANTERIOR directo
Si la cadena es `ParsePlan → UpdateSQL → SavePlan`, en `SavePlan` el `$json` es el output del UPDATE (vacío), no del ParsePlan. Siempre referenciar el nodo explícitamente: `$('Parse and Validate Plan').first().json.weekNumber`

### Nodo SQL con 0 filas detiene el flujo silenciosamente
Activar `"alwaysOutputData": true` en cualquier nodo Postgres SELECT que pueda retornar 0 filas cuando los 0 resultados son un caso válido (ej: "Get Previous Plan" para usuarios nuevos).

### IF node — comparar strings, no booleans
Usar typeVersion 2 del IF node. Retornar `'true'`/`'false'` como strings desde SQL y comparar con `string equals "true"`. El typeVersion 1 con boolean causa errores de tipo.

### n8n standalone (no docker-compose)
El contenedor `n8n` es standalone — **no** está en `docker-compose.yml`. No puede resolver hostnames de `fitai-network`. Siempre usar `host.docker.internal` para conectarse a PostgreSQL, Redis y Qdrant desde n8n.

---

## Reglas de Seguridad

1. **NUNCA** hardcodear credenciales, tokens o secrets en archivos del repositorio
2. **NUNCA** commitear el archivo `.env` — solo `.env.example`
3. Las credenciales de n8n (OpenAI API key, Telegram token) se configuran dentro de n8n via su UI, separadas del código fuente
4. El panel admin debe estar protegido por autenticación (session + bcrypt)
5. En producción, el panel admin debe estar detrás de Nginx con HTTPS
6. Redis y PostgreSQL no deben exponer puertos al exterior — solo accesibles dentro de la red Docker
7. Qdrant no debe exponer su puerto al exterior en producción
8. Usar `TELEGRAM_WEBHOOK_SECRET` para verificar la autenticidad de los webhooks

---

## Variables de Entorno Requeridas

| Variable | Descripción | Obligatoria |
|----------|------------|-------------|
| `OPENAI_API_KEY` | API key de OpenAI para GPT-4o y embeddings | Sí |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram (obtenido de BotFather) | Sí |
| `TELEGRAM_WEBHOOK_SECRET` | Secret para verificar webhooks de Telegram | Sí |
| `DATABASE_URL` | URL de conexión a PostgreSQL (`postgresql://user:pass@host:5432/db`) | Sí |
| `POSTGRES_USER` | Usuario de PostgreSQL (para Docker) | Sí |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL (para Docker) | Sí |
| `POSTGRES_DB` | Nombre de la base de datos (para Docker) | Sí |
| `REDIS_URL` | URL de conexión a Redis (`redis://host:6379`) | Sí |
| `QDRANT_URL` | URL de Qdrant (`http://host:6333`) | Sí |
| `QDRANT_API_KEY` | API key de Qdrant (si se configura autenticación) | No |
| `N8N_BASE_URL` | URL base de n8n (`http://localhost:5678`) | Sí |
| `N8N_API_KEY` | API key de n8n para acceso programático | Sí |
| `N8N_ENCRYPTION_KEY` | Clave de encriptación de credenciales en n8n | Sí |
| `ADMIN_PANEL_PORT` | Puerto del panel de administración (default: 3000) | No |
| `ADMIN_PANEL_SECRET_KEY` | Secret para sesiones del panel admin | Sí |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`) | No |
| `LOG_LEVEL` | Nivel de logging (`debug` / `info` / `warn` / `error`) | No |
