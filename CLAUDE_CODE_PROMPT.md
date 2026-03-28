# Prompt para Claude Code — FitAI Assistant
## Instrucción para ejecutar con /plan primero en modelo OPUS

---

> **INSTRUCCIÓN DE USO**:
> 1. Abre un proyecto nuevo en Claude Code
> 2. Asegúrate de tener seleccionado el modelo **claude-opus-4-5**
> 3. Ejecuta `/plan` con este prompt completo — OPUS generará el plan de arquitectura primero
> 4. Revisa y aprueba el plan antes de que comience a generar archivos
> 5. Una vez aprobado, OPUS construirá todos los archivos en orden

---

## CONTEXTO DEL PROYECTO

Construye la estructura completa de documentación, configuración e infraestructura de un sistema llamado **FitAI Assistant**.

### ¿Qué es FitAI?
Un asistente personal de salud y fitness por suscripción mensual que opera en Telegram. Ayuda a los usuarios a perder o ganar peso, mejorar su alimentación y construir rutinas de ejercicio, mediante conversaciones naturales con un agente de IA.

### Componentes del sistema
El sistema tiene DOS partes principales que corren en la misma VPS:

**1. Bot de Telegram** (cara al usuario final)
- Impulsado por **agentes de OpenAI** (GPT-4o) dentro de n8n
- Los agentes usan Tools/Function Calling para interactuar con la base de datos, RAG y lógica de negocio
- n8n orquesta todos los flujos, webhooks y schedulers

**2. Panel de administración web** (cara interna, solo admins)
- Permite registrar usuarios por número de Telegram
- Asignar plan (Básico / Pro / Premium) y gestionar membresías manualmente
- Marcar pagos como realizados (gestión 100% manual en fase 1)
- Activar / pausar / cancelar acceso al bot
- El bot verifica membresía activa en cada interacción antes de responder

### Stack tecnológico obligatorio
- **Agentes de IA en runtime**: OpenAI API (GPT-4o) — integración nativa en n8n via nodos AI Agent
- **Orquestación**: n8n self-hosted
- **Canal**: Telegram Bot API
- **Base de datos**: PostgreSQL
- **Caché**: Redis
- **Vector store**: Qdrant
- **Infraestructura**: Docker Compose en VPS Ubuntu 22.04+
- **Panel admin**: OPUS elige la tecnología más adecuada (considera criterios: velocidad de desarrollo, mantenibilidad, sin dependencias pesadas innecesarias)
- **Desarrollo**: Claude Code con MCPs disponibles

### MCPs disponibles para el desarrollo
```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "description": "Interactuar con la instancia de n8n: crear/editar workflows, ejecutar, obtener estado"
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"],
      "description": "Leer y escribir archivos del proyecto"
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" },
      "description": "Ejecutar queries directos a PostgreSQL durante desarrollo"
    }
  }
}
```

**Skill repositories de n8n a considerar:**
- https://github.com/czlonkowski/n8n-skills — colección de skills y patrones de n8n listos para usar
- https://github.com/czlonkowski/n8n-mcp — MCP para controlar n8n desde Claude Code

---

## TAREA: GENERAR ESTRUCTURA COMPLETA DEL PROYECTO

Genera todos los archivos listados a continuación con contenido **real, completo y profesional**. No uses placeholders, stubs ni frases como "aquí va el contenido". Cada archivo debe ser útil desde el primer día de desarrollo.

**Idioma**: documentación y prompts en **español**. Código, nombres de variables y comentarios inline en **inglés**.

---

### ARCHIVO 1: `CLAUDE.md`

Instrucciones principales para Claude Code al trabajar en este proyecto. Debe incluir:

- Descripción del proyecto y propósito
- Stack completo con versiones recomendadas
- **Separación crítica de roles**: OpenAI = LLM en producción dentro de n8n. Claude Code = herramienta de desarrollo. Nunca confundirlos.
- Estructura de directorios con descripción de cada carpeta y archivo importante
- Comandos frecuentes de desarrollo:
  - Setup inicial completo (clonar, variables de entorno, levantar Docker)
  - Iniciar n8n en local
  - Importar/exportar workflows de n8n
  - Correr migraciones de base de datos
  - Indexar documentos en Qdrant
  - Deploy a producción
- Configuración de MCPs: cómo configurar n8n-mcp, filesystem MCP y postgres MCP en `.mcp.json`
- Cómo usar n8n-mcp para crear y modificar workflows desde Claude Code sin entrar a la UI de n8n
- Cómo usar el skill repository de n8n (czlonkowski/n8n-skills) para acelerar la construcción de workflows
- Convenciones del proyecto: naming de archivos, estructura de workflows de n8n, formato de variables de entorno
- Flujo de trabajo recomendado: cómo combinar Claude Code + n8n-mcp + n8n UI
- Reglas de seguridad: nunca hardcodear credenciales, todas las keys en `.env`, n8n credentials separadas del código
- Variables de entorno requeridas (nombres y descripción, sin valores reales):
  - OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
  - DATABASE_URL, REDIS_URL, QDRANT_URL, QDRANT_API_KEY
  - N8N_BASE_URL, N8N_API_KEY
  - ADMIN_PANEL_PORT, ADMIN_PANEL_SECRET_KEY
  - NODE_ENV, LOG_LEVEL

---

### ARCHIVO 2: `README.md`

Documentación pública del proyecto:
- Descripción del producto y propuesta de valor
- Diagrama de arquitectura en ASCII o Mermaid
- Requisitos del sistema (VPS mínima: 2 vCPU, 4GB RAM, 40GB SSD)
- Guía de instalación completa paso a paso desde cero
- Configuración del bot de Telegram (BotFather, webhook)
- Configuración inicial de n8n
- Importación de workflows
- Variables de entorno
- Acceso al panel de administración
- Estructura del repositorio
- Roadmap de fases
- Cómo contribuir / levantar en local para desarrollo

---

### ARCHIVO 3: `docs/architecture.md`

Documento de arquitectura técnica:
- Diagrama completo en Mermaid del sistema (todos los componentes y sus relaciones)
- Descripción de cada componente y su responsabilidad exacta
- Flujo completo request-response: desde que el usuario envía un mensaje en Telegram hasta que recibe la respuesta (paso a paso, incluyendo cada nodo de n8n, cada herramienta del agente OpenAI y cada consulta a base de datos)
- Cómo funciona el sistema de verificación de membresía (flujo de acceso)
- Patrón de agente OpenAI en n8n: cómo se configura el AI Agent node, cómo se definen las tools, cómo funciona la memoria
- Estrategia de RAG: cómo se indexan documentos en Qdrant, cómo los recupera el agente, diferencia entre RAG personal y RAG de conocimiento
- Decisiones de arquitectura (ADRs): por qué OpenAI en n8n, por qué Qdrant, por qué gestión manual de pagos en fase 1
- Estrategia de escalabilidad para fase 3

---

### ARCHIVO 4: `docs/data-models.md`

Modelos de datos completos:

Schema SQL completo de PostgreSQL:
```sql
-- Incluir: CREATE TABLE, tipos exactos, constraints, índices, foreign keys
-- Tablas: users, memberships, payment_logs, user_profiles, goals,
--         meal_plans, exercise_plans, weight_logs, conversation_logs, admin_users
```

Para cada tabla:
- Descripción del propósito
- Descripción de campos no obvios
- Índices recomendados y su justificación

Diagrama ER en Mermaid.

Estructura JSON completa de `meal_plans.plan_json` — incluir ejemplo real de una semana completa con 7 días × 3 comidas + snacks, con macros.

Estructura JSON completa de `exercise_plans.plan_json` — incluir ejemplo real de una semana con 5 días de entrenamiento, series, repeticiones y notas de forma.

Estructura de documentos en Qdrant:
- Colección `user_rag`: campos, metadata requerida (user_id, type, date, summary)
- Colección `knowledge_rag`: campos, metadata requerida (category, subcategory, source)

Estrategia de migración: cómo manejar cambios de schema en producción.

---

### ARCHIVO 5: `docs/n8n-flows.md`

Documentación de todos los workflows de n8n. Para cada workflow:
- Nombre exacto del workflow en n8n
- Trigger (webhook, cron, manual, otro workflow)
- Descripción del propósito
- Nodos usados en orden (con configuración relevante)
- Lógica de ramificación (condiciones IF/Switch)
- Manejo de errores
- Variables de entorno y credenciales que necesita

Workflows a documentar:

1. **`FitAI - Telegram Webhook Handler`**
   - Recibe todos los mensajes de Telegram
   - Verifica membresía activa en PostgreSQL
   - Si no tiene membresía: responde con mensaje estándar y termina
   - Si tiene membresía: extrae user_id, mensaje, tipo y enruta al agente principal

2. **`FitAI - Main AI Agent`**
   - Nodo AI Agent con OpenAI GPT-4o
   - System prompt completo del asistente
   - Window Buffer Memory configurado
   - Todas las tools definidas como sub-workflows o HTTP Request nodes
   - Envío de respuesta a Telegram

3. **`FitAI - Onboarding Flow`**
   - Detecta si el usuario ya completó el onboarding
   - Maneja el estado del onboarding en Redis
   - Guía conversacional por todas las preguntas
   - Al completar: calcula métricas, guarda perfil, genera primer plan de comidas

4. **`FitAI - Meal Plan Generator`**
   - Tool invocada por el agente
   - Construye el prompt con perfil del usuario
   - Llama a OpenAI para generar el plan
   - Parsea y guarda en PostgreSQL
   - Retorna el plan formateado

5. **`FitAI - Meal Reminder Scheduler`**
   - Cron trigger según horario de cada usuario
   - Obtiene la comida del momento para cada usuario activo
   - Envía recordatorio personalizado por Telegram

6. **`FitAI - Weight Update Requester`**
   - Cron semanal
   - Solicita actualización de peso a usuarios activos
   - Guarda respuesta en weight_logs

7. **`FitAI - Progress Calculator`**
   - Tool invocada por el agente
   - Calcula todos los indicadores de progreso
   - Genera reporte en formato conversacional

8. **`FitAI - Workout Plan Generator`**
   - Tool invocada por el agente
   - Genera rutina personalizada con OpenAI
   - Guarda en PostgreSQL

9. **`FitAI - RAG Personal Indexer`**
   - Trigger: después de cada conversación significativa
   - Extrae información relevante para el RAG personal
   - Genera embedding y guarda en Qdrant con metadata del usuario

10. **`FitAI - Membership Alert`**
    - Cron diario
    - Detecta membresías que vencen en 3 días
    - Notifica al usuario por Telegram
    - Notifica al admin vía Telegram o email

---

### ARCHIVO 6: `docs/api-integrations.md`

Documentación de integraciones externas:

**Telegram Bot API:**
- Setup completo: crear bot con BotFather, obtener token, configurar webhook
- Tipos de mensajes relevantes: texto, foto, comandos
- Cómo manejar comandos (/start, /plan, /progreso, /ayuda)
- Inline keyboards para respuestas rápidas
- Límites de la API y manejo de errores

**OpenAI API en n8n:**
- Credencial en n8n: cómo configurarla
- Configuración del nodo AI Agent: modelo, temperature, max_tokens recomendados
- Cómo definir tools en el AI Agent node de n8n
- Configuración de Window Buffer Memory: tamaño de ventana recomendado
- Configuración del Vector Store Tool con Qdrant
- Manejo de rate limits y errores
- Estimación de costos por usuario/mes

**Qdrant:**
- Setup de colecciones: `user_rag` y `knowledge_rag`
- Dimensión de embeddings (text-embedding-3-small: 1536)
- Cómo hacer upsert de documentos
- Cómo buscar con filtros por `user_id`
- Cómo usar el Qdrant node nativo de n8n

**PostgreSQL:**
- Credencial en n8n
- Cómo usar el Postgres node en workflows
- Patrones de queries frecuentes

**Redis:**
- Uso para estado de onboarding (key: `onboarding:{telegram_id}`)
- TTL recomendado
- Uso del Redis node en n8n

---

### ARCHIVO 7: `docs/admin-panel.md`

Documentación completa del panel de administración:
- Tecnología elegida por OPUS y justificación
- Wireframes en ASCII de las pantallas principales:
  - Dashboard principal (métricas globales)
  - Lista de usuarios con filtros
  - Detalle de usuario (perfil + membresía + historial de pagos)
  - Formulario de alta de usuario
  - Formulario de registro de pago
- Rutas/endpoints del panel
- Sistema de autenticación del admin (usuario/contraseña, sesión)
- Cómo se integra con PostgreSQL (misma base de datos del bot)
- Cómo el panel activa/desactiva el acceso al bot en tiempo real
- Guía de instalación y configuración
- Cómo protegerlo en producción (nginx, autenticación básica o sesión)

---

### ARCHIVO 8: `docs/deployment.md`

Guía completa de despliegue:
- Requisitos de VPS (mínimo: 2 vCPU, 4GB RAM, 40GB SSD)
- Instalación de Docker y Docker Compose en Ubuntu 22.04
- Estructura de `docker-compose.yml` (descripción de cada servicio)
- Configuración de Nginx como reverse proxy
- Configuración de SSL con Certbot (Let's Encrypt)
- Configuración de UFW (firewall)
- Variables de entorno en producción
- Proceso de primer deploy
- Cómo importar workflows iniciales en n8n
- Backups automáticos de PostgreSQL
- Monitoreo básico (uptime, logs)
- Proceso de actualización sin downtime

---

### ARCHIVO 9: `skills/nutrition.md`

Skill de conocimiento nutricional para el agente:
- Fórmulas con implementación en JavaScript:
  - IMC = peso(kg) / estatura(m)²
  - TMB Mifflin-St Jeor (hombre y mujer)
  - TDEE = TMB × factor de actividad
  - Déficit/superávit calórico recomendado según objetivo
- Tabla de factores de actividad
- Distribución de macronutrientes por objetivo (pérdida de grasa / ganancia muscular / mantenimiento / recomposición)
- Macros de referencia de alimentos comunes categorizados
- Principios para la distribución calórica entre comidas del día
- Consideraciones para restricciones: vegetariano, vegano, sin gluten, sin lactosa, alergias comunes
- Señales de alerta que el agente debe detectar: restricción calórica extrema, patrones desordenados, preguntas que sugieren relación poco saludable con la comida

---

### ARCHIVO 10: `skills/fitness.md`

Skill de conocimiento de fitness:
- Principios de programación: progresión, volumen, frecuencia, intensidad, deload
- Tipos de entrenamiento y sus usos: fuerza, cardio, HIIT, movilidad, funcional
- Plantillas de rutinas por nivel y objetivo (con ejercicios reales, series y repeticiones):
  - Principiante pérdida de grasa en casa (3 días/semana)
  - Principiante ganancia muscular en gimnasio (3 días/semana)
  - Intermedio recomposición en gimnasio (4 días/semana)
- Principios de recuperación: sueño, descanso activo, nutrición post-entrenamiento
- Señales de sobreentrenamiento
- Adaptaciones de ejercicios para lesiones comunes: rodilla, lumbar, hombro, muñeca

---

### ARCHIVO 11: `skills/habit-psychology.md`

Skill de psicología del hábito y coaching:
- Modelo del lazo de hábito (señal → rutina → recompensa) aplicado a nutrición y ejercicio
- Técnicas de habit stacking para incorporar nuevos hábitos
- Estrategias para superar resistencia, falta de motivación y excusas recurrentes
- Cómo detectar estados emocionales negativos en el texto del usuario (palabras clave, patrones)
- Respuestas modelo para cada estado emocional (frustración, desmotivación, culpa, estrés)
- Técnicas de celebración de hitos sin descarrilar el proceso
- Gestión de la meseta: qué decir, qué ajustar, cómo mantener motivación
- Frases de coaching positivo que el agente puede usar contextualmente
- Límites del agente: qué situaciones requieren derivar a un profesional

---

### ARCHIVO 12: `skills/metrics-calculation.md`

Skill de cálculo de indicadores con implementaciones:
```javascript
// Incluir implementaciones completas y funcionales de:
// - calculateBMI(weightKg, heightM)
// - calculateBMR_MifflinStJeor(weightKg, heightCm, ageYears, gender)
// - calculateTDEE(bmr, activityLevel)
// - calculateCaloricTarget(tdee, goal) // goal: 'lose' | 'gain' | 'maintain'
// - calculateNavyBodyFat(gender, waistCm, neckCm, heightCm, hipCm?)
// - calculateProgressPercentage(startValue, currentValue, targetValue)
// - projectGoalDate(currentWeight, targetWeight, weeklyRateKg)
// - detectPlateau(weightLogs) // retorna true si no hay cambio significativo en 3+ semanas
// - calculateWeeklyRate(weightLogs) // kg por semana promedio
```
- Rangos de referencia por indicador (IMC saludable, ritmo seguro de pérdida/ganancia)
- Cuándo y cómo comunicar una meseta al usuario
- Cuándo ajustar calorías y macros (reglas de decisión)

---

### ARCHIVO 13: `prompts/system-prompt.md`

System prompt completo para el agente OpenAI en n8n:
- Rol: eres FitAI, coach personal de nutrición y fitness. No eres médico, no das diagnósticos.
- Personalidad: cálido, motivador, directo, sin juicios
- Reglas de formato para Telegram: máximo 3-4 bloques por mensaje, emojis con moderación (máximo 2 por mensaje), usar negritas con parsimonia
- Cómo usar el contexto del usuario: SIEMPRE consultar el perfil antes de responder, SIEMPRE personalizar la respuesta
- Cómo usar las tools: cuándo llamar a cada tool, cómo interpretar sus resultados
- Qué hacer si el usuario pregunta algo fuera del dominio (salud mental, condiciones médicas graves, etc.)
- Qué hacer si el usuario expresa emociones negativas intensas
- Qué no hacer nunca: dar diagnósticos, prometer resultados específicos, dar información médica como si fuera un médico
- Ejemplos de respuestas buenas vs malas (few-shot, mínimo 5 ejemplos por categoría):
  - Recordar una comida
  - Reemplazar una comida
  - Responder sobre progreso
  - Manejar frustración del usuario
  - Responder pregunta técnica de nutrición

---

### ARCHIVO 14: `prompts/onboarding.md`

Flujo de onboarding completo:
- Mensaje de bienvenida inicial
- Secuencia exacta de preguntas con texto en español
- Para cada pregunta: texto exacto, tipo de respuesta esperada, validación, mensaje de error si la respuesta es inválida
- Lógica de ramificación:
  - Si no conoce su % de grasa: omitir esa pregunta
  - Si tiene restricciones dietarias: preguntar cuáles específicamente
  - Si tiene lesiones: preguntar detalles
- Resumen del perfil creado para confirmación del usuario (con todos los datos ingresados)
- Cálculo y presentación de los indicadores iniciales (IMC, TMB, TDEE, calorías objetivo)
- Mensaje de cierre del onboarding con los primeros pasos

---

### ARCHIVO 15: `prompts/meal-plan-generation.md`

Template de prompt para generación de planes de comidas:
- Template completo con todas las variables: `{{userName}}`, `{{caloricTarget}}`, `{{proteinTarget}}`, `{{carbTarget}}`, `{{fatTarget}}`, `{{dietaryRestrictions}}`, `{{dislikedFoods}}`, `{{weekNumber}}`, `{{localCulture}}`
- Instrucciones para el modelo: variedad, balance, accesibilidad de ingredientes, preparación realista
- Formato de salida esperado en JSON — con ejemplo real y completo de una semana (7 días × desayuno + almuerzo + cena + snack, con macros)
- Template para recordar una comida específica
- Template para reemplazar una comida específica
- Template para solicitar receta detallada

---

### ARCHIVO 16: `prompts/workout-plan-generation.md`

Template de prompt para generación de planes de ejercicio:
- Template con variables: `{{fitnessLevel}}`, `{{goal}}`, `{{availableDays}}`, `{{equipment}}`, `{{injuries}}`, `{{weekNumber}}`
- Instrucciones para el modelo: progresión, variedad, explicación de forma
- Formato de salida en JSON — con ejemplo real completo de una semana (5 días con ejercicios, series, repeticiones, descanso, notas de forma)
- Template para adaptar el plan por lesión o fatiga reportada

---

### ARCHIVO 17: `n8n/workflows/README.md`

Guía de los workflows:
- Lista de todos los workflows con descripción en una línea
- Dependencias entre workflows (cuál llama a cuál)
- Credenciales necesarias en n8n y cómo configurarlas
- Orden de importación recomendado
- Cómo testear cada workflow en local (con datos de prueba)
- Cómo usar n8n-mcp desde Claude Code para crear workflows programáticamente en lugar de usar la UI
- Cómo obtener los skill templates de https://github.com/czlonkowski/n8n-skills y adaptarlos

---

### ARCHIVOS DE CONFIGURACIÓN

**`.mcp.json`**: configuración completa de MCPs para Claude Code (n8n-mcp, filesystem, postgres) con instrucciones de setup

**`.env.example`**: todas las variables de entorno con nombre, descripción, ejemplo de formato y si son obligatorias u opcionales

**`docker-compose.yml`**: stack completo con servicios: n8n, postgres, redis, qdrant, admin-panel, nginx — con volumes, networks, healthchecks y restart policies

**`infra/nginx.conf`**: configuración de Nginx como reverse proxy para n8n (puerto 5678), panel admin (puerto configurable) y API del bot si aplica, con headers de seguridad

**`admin-panel/README.md`**: instrucciones específicas para el panel admin: cómo instalar, configurar, primera ejecución, cómo crear el primer usuario administrador

**`src/bot/handlers/README.md`**: descripción de los handlers del bot de Telegram y cómo se integran con n8n

---

## INSTRUCCIONES DE EJECUCIÓN PARA OPUS

1. **Primero el plan** (`/plan`): antes de generar cualquier archivo, presenta el plan completo de lo que vas a construir, el orden de generación y cualquier decisión de arquitectura que necesites tomar (especialmente la tecnología del panel admin). Espera aprobación.

2. **Decisión sobre el panel admin**: evalúa las opciones (Next.js, Express+EJS, Fastify+HTML, etc.) considerando: mínimas dependencias, fácil de desplegar en Docker, UI funcional sin ser compleja, autenticación simple. Justifica tu elección en el plan.

3. **Orden de generación**: CLAUDE.md → README.md → archivos de configuración (.mcp.json, .env.example, docker-compose.yml) → docs/ → skills/ → prompts/ → n8n/workflows/README.md → admin-panel/README.md → src/

4. **Contenido real, no stubs**: cada archivo debe ser usable desde el primer día. Sin "TODO", sin "ver sección X", sin placeholders que no sean variables de template explícitamente marcadas con `{{variable}}`.

5. **Coherencia entre archivos**: los nombres de workflows en `n8n-flows.md` deben coincidir con los de `n8n/workflows/README.md`. Los campos en `data-models.md` deben coincidir con los queries en `api-integrations.md`. Las variables en `.env.example` deben coincidir con las mencionadas en `CLAUDE.md`.

6. **Al finalizar**: genera `docs/project-status.md` con la lista completa de archivos generados, su estado, tamaño aproximado de contenido y los siguientes 5 pasos de desarrollo recomendados para empezar a construir el sistema real.
