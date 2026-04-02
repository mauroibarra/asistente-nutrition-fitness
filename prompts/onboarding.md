# FitAI Assistant - Onboarding v2 (Conversacional por Bloques)

> Documento de referencia para la implementacion del onboarding conversacional.
> Todo el contenido dirigido al usuario esta en espanol.
> Las variables se expresan como `{{variable}}`.

---

## Filosofia del Rediseno

El onboarding v1 tenia 18+ pasos individuales donde cada respuesta del usuario recibia una confirmacion robotica ("Perfecto, tu edad es 28 anos"). Esto generaba una experiencia de formulario, no de conversacion.

El onboarding v2 se basa en 3 principios:

1. **Bloques conversacionales**: las preguntas se agrupan por tema (datos fisicos, alimentacion, ejercicio). Cada bloque se siente como un intercambio natural, no como un interrogatorio.
2. **Acuse de recibo minimo**: cuando el usuario responde, el bot acusa recibo con una palabra ("Va", "Ok", "Listo") y avanza a la siguiente pregunta o bloque. NUNCA repite lo que el usuario dijo.
3. **Transicion fluida al coaching**: al terminar, el bot presenta las metricas en contexto conversacional, genera el plan del primer dia, y explica como va a funcionar el servicio. No hay "mensaje de cierre" generico.

---

## 1. Mensaje de Bienvenida

**Trigger:** El usuario envia `/start` o es detectado como usuario nuevo con membresia activa.

```text
Hola! Soy tu coach de nutricion y fitness. Voy a acompanarte en todo el proceso para que llegues a tu meta.

Antes de armar tu plan necesito conocerte. Son unas preguntas rapidas, como 3 minutos.

Como te llamo?
```

**Estado Redis inicial:**

```json
{
  "step": "ask_name",
  "started_at": "{{iso_timestamp}}",
  "telegram_id": "{{telegram_id}}",
  "data": {},
  "temp": {}
}
```

**Notas de diseno:**
- No se menciona el nombre del servicio ("FitAI Assistant") — un coach real no dice el nombre de su empresa cada vez que saluda
- No se ofrecen comandos de cancelacion en la bienvenida — distrae del flujo. El comando /cancelar sigue funcionando si el usuario lo escribe
- La primera pregunta va integrada en el mensaje de bienvenida para reducir un intercambio

---

## 2. Secuencia de Preguntas por Bloques

El onboarding se organiza en 5 bloques tematicos. Dentro de cada bloque, las preguntas fluyen sin confirmaciones intermedias.

---

### BLOQUE 1: Identidad y Cuerpo

**Paso 1 - Nombre**

| Campo | Valor |
|---|---|
| **Pregunta** | (integrada en bienvenida) |
| **Tipo** | Texto libre |
| **Validacion** | 2-40 caracteres, solo letras/espacios/guiones |
| **Error** | `Solo necesito tu nombre (letras, entre 2 y 40 caracteres).` |
| **Variable** | `first_name` |
| **Step** | `ask_name` |

**Transicion a paso 2:**

```text
{{first_name}}, mucho gusto. Necesito unos datos fisicos basicos para calcular tus requerimientos. Empezamos:

Genero biologico?
```

`[ Hombre ]  [ Mujer ]`

**Notas:**
- Se usa el nombre inmediatamente para personalizar
- "Mucho gusto" es natural y breve — no "Excelente! Gracias por compartir tu nombre"
- La transicion al bloque fisico es directa

**Paso 2 - Genero**

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Botones** | `[ Hombre ]  [ Mujer ]` |
| **Mapping** | Hombre → `male`, Mujer → `female` |
| **Variable** | `gender` |
| **Step** | `ask_gender` |

**Transicion a paso 3:**

```text
Edad?
```

**Notas:**
- Una sola palabra. Un coach real pregunta asi. No "Ahora necesito saber tu edad para calcular tu metabolismo basal."

**Paso 3 - Edad**

| Campo | Valor |
|---|---|
| **Tipo** | Numero |
| **Validacion** | Entero entre 14 y 100 |
| **Error** | `Necesito un numero entre 14 y 100.` |
| **Variable** | `age` |
| **Step** | `ask_age` |

**Transicion a paso 4:**

```text
Estatura en cm? (ej: 170)
```

**Paso 4 - Estatura**

| Campo | Valor |
|---|---|
| **Tipo** | Numero |
| **Validacion** | 100-250, acepta 1 decimal |
| **Error** | `Necesito la estatura en centimetros (entre 100 y 250). Ej: 170` |
| **Variable** | `height_cm` |
| **Step** | `ask_height` |

**Transicion a paso 5:**

```text
Y peso actual en kg? (ej: 80)
```

**Paso 5 - Peso**

| Campo | Valor |
|---|---|
| **Tipo** | Numero |
| **Validacion** | 30-300, acepta 1 decimal |
| **Error** | `Necesito el peso en kilos (entre 30 y 300). Ej: 75` |
| **Variable** | `weight_kg` |
| **Step** | `ask_weight` |

**Transicion al Bloque 2:**

```text
Listo, ahora lo mas importante: que quieres lograr?
```

`[ Perder grasa ]  [ Ganar musculo ]  [ Mantener peso ]  [ Recomposicion corporal ]`

**Notas sobre el Bloque 1:**
- Las preguntas de datos fisicos se sienten como un solo flujo rapido (genero → edad → estatura → peso)
- No hay confirmaciones intermedias. El acuse de recibo es la pregunta siguiente
- El "Y peso actual" con la "Y" da sensacion de continuidad

---

### BLOQUE 2: Objetivo y Meta

**Paso 6 - Objetivo principal**

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Botones** | `[ Perder grasa ]  [ Ganar musculo ]  [ Mantener peso ]  [ Recomposicion corporal ]` |
| **Mapping** | Perder grasa → `lose_fat`, Ganar musculo → `gain_muscle`, Mantener peso → `maintain`, Recomposicion corporal → `recomposition` |
| **Variable** | `goal_type` |
| **Step** | `ask_goal` |

**Transicion condicional:**

Si `goal_type` es `lose_fat` o `gain_muscle`:

```text
A cuanto quieres llegar? (peso meta en kg)
```

Si `goal_type` es `maintain` o `recomposition`:

→ Saltar a paso 8 (target_weight = null)

**Paso 7 - Peso objetivo** (condicional)

| Campo | Valor |
|---|---|
| **Tipo** | Numero |
| **Validacion** | 30-300, acepta 1 decimal. Debe ser < peso actual si `lose_fat`, > peso actual si `gain_muscle` |
| **Error** | Para lose_fat: `El peso meta debe ser menor a tu peso actual ({{weight_kg}} kg).` Para gain_muscle: `El peso meta debe ser mayor a tu peso actual ({{weight_kg}} kg).` |
| **Variable** | `target_weight` |
| **Step** | `ask_target_weight` |

**Transicion al Bloque 3:**

```text
Va. Ahora unas preguntas sobre como comes.

Tienes alguna restriccion dietaria o alergia alimentaria?
```

`[ Si, tengo ]  [ No, ninguna ]`

---

### BLOQUE 3: Alimentacion

**Paso 8 - Restricciones y alergias** (combinadas en un solo flujo)

**Parte A: Pregunta inicial**

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Botones** | `[ Si, tengo ]  [ No, ninguna ]` |
| **Step** | `ask_dietary_restrictions_known` |

Si "No, ninguna": `dietary_restrictions = []`, `food_allergies = []` → Saltar a paso 9

Si "Si, tengo":

```text
Escribe todo junto: restricciones (vegetariano, vegano, sin gluten, etc.) y alergias (mani, mariscos, etc.) separadas por comas. Si solo tienes una cosa, igual escribela.
```

| Campo | Valor |
|---|---|
| **Tipo** | Texto libre |
| **Validacion** | 2-500 caracteres |
| **Error** | `Escribe tus restricciones y/o alergias separadas por comas.` |
| **Variables** | El sistema clasifica automaticamente en `dietary_restrictions` y `food_allergies` usando logica simple: vegetariano/vegano/sin gluten/sin lactosa/kosher/halal → restriction. Todo lo demas → allergy. |
| **Step** | `ask_dietary_input` |

**Notas:**
- En v1 habia 4 pasos separados (restricciones si/no, cuales, alergias si/no, cuales). En v2 es 1-2 pasos
- La clasificacion automatica evita preguntar dos veces cosas similares

**Paso 9 - Alimentos que no le gustan**

**Transicion:**

```text
Hay alimentos que no te gusten? Escribelos o pon "no" si comes de todo.
```

| Campo | Valor |
|---|---|
| **Tipo** | Texto libre |
| **Validacion** | 1-300 caracteres. "no", "ninguno", "nada" → array vacio |
| **Variable** | `disliked_foods` |
| **Step** | `ask_disliked_foods` |

**Paso 10 - Presupuesto**

**Transicion:**

```text
Ok. Y tu presupuesto para ingredientes?
```

`[ Economico ]  [ Moderado ]  [ Sin limite ]`

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Mapping** | Economico → `low`, Moderado → `medium`, Sin limite → `high` |
| **Variable** | `budget_level` |
| **Step** | `ask_budget` |

**Paso 11 - Comidas al dia**

**Transicion:**

```text
Cuantas comidas al dia prefieres?
```

`[ 3 ]  [ 4 ]  [ 5 ]`

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Variable** | `meals_per_day` |
| **Step** | `ask_meals` |

**Transicion al Bloque 4:**

```text
Bien, ahora el tema del ejercicio.

Como describirias tu experiencia entrenando?
```

`[ Principiante (< 6 meses) ]  [ Intermedio (6 meses - 2 anos) ]  [ Avanzado (2+ anos) ]`

---

### BLOQUE 4: Ejercicio y Cuerpo

**Paso 12 - Nivel de fitness**

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Botones** | `[ Principiante (< 6 meses) ]  [ Intermedio (6 meses - 2 anos) ]  [ Avanzado (2+ anos) ]` |
| **Mapping** | Principiante → `beginner`, Intermedio → `intermediate`, Avanzado → `advanced` |
| **Variable** | `fitness_level` |
| **Step** | `ask_fitness_level` |

**Paso 13 - Equipo disponible**

**Transicion:**

```text
Donde entrenas o planeas entrenar?
```

`[ Casa sin equipo ]  [ Casa con mancuernas/bandas ]  [ Gimnasio ]`

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Mapping** | Casa sin equipo → `bodyweight`, Casa con mancuernas/bandas → `home_basic`, Gimnasio → `full_gym` |
| **Variable** | `equipment` |
| **Step** | `ask_equipment` |

**Paso 14 - Dias de entrenamiento**

**Transicion:**

```text
Cuantos dias a la semana puedes entrenar?
```

`[ 2 ]  [ 3 ]  [ 4 ]  [ 5 ]  [ 6 ]`

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard |
| **Variable** | `training_days_per_week` |
| **Step** | `ask_training_days` |

**Paso 15 - Lesiones** (simplificado)

**Transicion:**

```text
Alguna lesion o condicion fisica que deba saber?
```

`[ No, estoy bien ]  [ Si, tengo ]`

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard + texto libre condicional |
| **Step** | `ask_injuries` |

Si "Si, tengo":

```text
Describela brevemente.
```

| Campo | Valor |
|---|---|
| **Tipo** | Texto libre |
| **Validacion** | 3-500 caracteres |
| **Variable** | `injuries` |
| **Step** | `ask_injuries_input` |

Si "No, estoy bien": `injuries = null`

---

### BLOQUE 5: Estilo de Vida

**Transicion al bloque:**

```text
Casi terminamos. Solo necesito saber tus horarios.

A que hora te despiertas normalmente?
```

`[ 5:00 ]  [ 6:00 ]  [ 7:00 ]  [ 8:00 ]  [ 9:00 ]  [ Otra ]`

**Paso 16 - Hora de despertar**

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard + texto libre si "Otra" |
| **Mapping** | Cada boton → valor string "HH:00". "Otra" → pide texto libre formato HH:MM |
| **Variable** | `wake_up_time` |
| **Step** | `ask_wake_time` |

Si "Otra":

```text
Escribe la hora en formato HH:MM (ej: 06:30)
```

**Paso 17 - Nivel de actividad diaria**

**Transicion:**

```text
Fuera del ejercicio, como es tu dia a dia?
```

`[ Sentado casi todo el dia ]`
`[ Camino algo, tareas ligeras ]`
`[ De pie bastante, camino mucho ]`
`[ Trabajo fisico pesado ]`

| Campo | Valor |
|---|---|
| **Tipo** | Inline keyboard (botones apilados) |
| **Mapping** | Sentado → `sedentary`, Camino algo → `lightly_active`, De pie bastante → `moderately_active`, Trabajo fisico → `very_active` |
| **Variable** | `activity_level` |
| **Step** | `ask_activity_level` |

**Notas:**
- Se redujo de 5 a 4 opciones (se elimino `extra_active` que es extremadamente raro y confuso)
- Las descripciones son mas coloquiales
- Esta pregunta se movio al final porque tiene mas sentido despues de hablar de ejercicio — el usuario ya diferencia entre su actividad de ejercicio y la del dia a dia

---

## 3. Confirmacion Rapida (sin data dump)

**Trigger:** Se completaron todos los pasos.

En vez de mostrar TODOS los datos en un resumen extenso, se muestra un resumen ultra-breve y se pide confirmacion directa:

```text
Listo, {{first_name}}. Confirmo los datos clave:

{{age}} anos, {{height_cm}} cm, {{weight_kg}} kg
Objetivo: {{goal_display}}{{#if target_weight}} → meta: {{target_weight}} kg{{/if}}
{{training_days_per_week}} dias de ejercicio, {{meals_per_day}} comidas al dia

Todo bien o quieres corregir algo?
```

`[ Todo bien, dale ]  [ Quiero corregir algo ]`

**Step Redis:** `confirm_profile`

**Si "Quiero corregir algo":**

```text
Que quieres cambiar?
```

`[ Datos fisicos ]  [ Objetivo ]  [ Alimentacion ]  [ Ejercicio ]  [ Horarios ]`

Al seleccionar una categoria, se re-hacen SOLO las preguntas de ese bloque. Al terminar, se vuelve a mostrar el resumen breve.

**Step Redis:** `correct_block`

**Notas:**
- El resumen v1 mostraba 20+ campos. El v2 muestra solo lo critico (5-6 datos)
- Se corrige por bloque, no campo por campo — mas rapido y menos tedioso
- El boton dice "Todo bien, dale" no "Confirmar" — lenguaje natural

---

## 4. Calculo de Indicadores

**Trigger:** El usuario confirma con "Todo bien, dale".

Los calculos son identicos al v1 (BMI, BMR Mifflin-St Jeor, TDEE, objetivo calorico, macros). No se repiten las formulas aqui — ver la seccion 5 del documento v1 o `skills/business/metrics-calculation.md`.

**Formulas de objetivo calorico actualizadas:**

| Objetivo | Calculo | Descripcion |
|---|---|---|
| `lose_fat` | `TDEE * 0.80` | Deficit del 20% |
| `gain_muscle` | `TDEE * 1.10` | Superavit del 10% |
| `maintain` | `TDEE * 1.0` | Mantenimiento |
| `recomposition` | `TDEE * 0.95` | Deficit ligero del 5% |

Minimos absolutos: 1200 kcal mujeres, 1500 kcal hombres.

---

## 5. Transicion al Coaching (CRITICO)

Este es el cambio mas importante del rediseno. Al completar el onboarding, el bot NO muestra una lista de comandos ni un "estoy listo para ayudarte". En su lugar, presenta las metricas de forma conversacional, genera el plan del primer dia, y establece expectativas claras del servicio.

### Mensaje de metricas contextuales

```text
{{first_name}}, ya tengo todo.

Tu cuerpo gasta unas *{{tdee}} kcal* al dia. {{goalExplanation}}

{{#if goal_type == "lose_fat"}}
Vamos a trabajar con *{{caloric_target}} kcal* diarias — un deficit de *{{deficit}} kcal* que te permite perder grasa sin perder musculo. Tu meta de proteina diaria: *{{protein_g}}g*.
{{/if}}

{{#if goal_type == "gain_muscle"}}
Vamos a trabajar con *{{caloric_target}} kcal* diarias — un superavit controlado de *{{surplus}} kcal* para ganar musculo limpio. Tu meta de proteina diaria: *{{protein_g}}g*.
{{/if}}

{{#if goal_type == "maintain"}}
Vamos a mantener tus *{{caloric_target}} kcal* diarias con un enfoque en *{{protein_g}}g de proteina* para mantener tu composicion corporal.
{{/if}}

{{#if goal_type == "recomposition"}}
Vamos a trabajar con *{{caloric_target}} kcal* diarias y *{{protein_g}}g de proteina* — la clave para recomposicion es entrenamiento de fuerza + proteina alta.
{{/if}}

Tu IMC hoy: *{{bmi}}* ({{bmi_category}}).{{#if target_weight}} Para llegar a *{{target_weight}} kg*, a un ritmo saludable estamos hablando de unas *{{estimated_weeks}} semanas*.{{/if}}
```

**Variables de goalExplanation:**

| goal_type | goalExplanation |
|---|---|
| `lose_fat` | "Para bajar de peso de forma sostenible, la clave es mantener un deficit calorico moderado sin pasar hambre." |
| `gain_muscle` | "Para ganar musculo necesitas comer un poco mas de lo que gastas y asegurar suficiente proteina." |
| `maintain` | "Para mantener tu peso, el enfoque es equilibrar lo que comes con lo que gastas." |
| `recomposition` | "La recomposicion es ganar musculo mientras pierdes grasa — el proceso mas lento pero mas transformador." |

### Mensaje de bienvenida al servicio

Se envia como segundo mensaje, inmediatamente despues de las metricas:

```text
Ya te prepare tu plan de comidas para manana. Te lo mando temprano junto con tu meta del dia.

Asi va a funcionar: cada manana te envio tu plan con las comidas y calorias. Durante el dia me vas contando que comiste y yo llevo la cuenta de como vas. En la noche hacemos un check rapido. Y cada semana te mando tu resumen de progreso con numeros reales.

Descansa bien, que manana arrancamos 💪
```

### Acciones automaticas al completar

En este orden (ejecutadas por el workflow):

1. Guardar perfil completo en PostgreSQL (user_profiles)
2. Guardar goal en tabla goals
3. Guardar peso inicial en weight_logs
4. Crear registro en daily_targets para manana
5. Generar plan de comidas del dia siguiente (invocar Meal Plan Generator con plan_date = tomorrow)
6. Programar morning briefing para el dia siguiente segun wake_up_time
7. Eliminar estado de onboarding de Redis
8. Indexar resumen del onboarding en RAG personal

**NO se hace:**
- No se muestra lista de comandos (/plan, /entrenamiento, /progreso) — el usuario no necesita memorizar comandos, el coach toma la iniciativa
- No se pregunta "quieres ver tu plan de comidas?" — ya se le dijo que manana se lo manda
- No se dice "estoy aqui para lo que necesites" — eso es pasivo

---

## 6. Gestion de Estado en Redis

### Clave Redis

```
onboarding:{telegram_id}
```

### TTL

48 horas (172800 segundos). Ampliado de 24h a 48h para dar mas flexibilidad. Se renueva con cada interaccion.

### Estructura del Estado

```json
{
  "telegram_id": 123456789,
  "step": "ask_name",
  "block": 1,
  "started_at": "2026-03-26T10:00:00Z",
  "updated_at": "2026-03-26T10:01:30Z",
  "data": {
    "first_name": null,
    "gender": null,
    "age": null,
    "height_cm": null,
    "weight_kg": null,
    "goal_type": null,
    "target_weight": null,
    "dietary_restrictions": [],
    "food_allergies": [],
    "disliked_foods": [],
    "budget_level": null,
    "meals_per_day": null,
    "fitness_level": null,
    "equipment": null,
    "training_days_per_week": null,
    "injuries": null,
    "wake_up_time": null,
    "activity_level": null
  },
  "temp": {}
}
```

### Valores validos para `step`

```
ask_name
ask_gender
ask_age
ask_height
ask_weight
ask_goal
ask_target_weight
ask_dietary_restrictions_known
ask_dietary_input
ask_disliked_foods
ask_budget
ask_meals
ask_fitness_level
ask_equipment
ask_training_days
ask_injuries
ask_injuries_input
ask_wake_time
ask_wake_time_custom
ask_activity_level
confirm_profile
correct_block
calculate_and_complete
```

Total: 21 steps posibles (vs 26 en v1), pero el usuario tipico pasa por 17 (vs 22+ en v1) gracias a las preguntas combinadas y la eliminacion de sub-preguntas innecesarias.

### Flujo de ramificacion

```
BIENVENIDA + ask_name
  |
  v
[BLOQUE 1: Identidad y Cuerpo]
  ask_gender → ask_age → ask_height → ask_weight
  |
  v
[BLOQUE 2: Objetivo]
  ask_goal
    |-- lose_fat / gain_muscle → ask_target_weight → BLOQUE 3
    |-- maintain / recomposition → BLOQUE 3
  |
  v
[BLOQUE 3: Alimentacion]
  ask_dietary_restrictions_known
    |-- "Si" → ask_dietary_input → ask_disliked_foods
    |-- "No" → ask_disliked_foods
  → ask_budget → ask_meals
  |
  v
[BLOQUE 4: Ejercicio]
  ask_fitness_level → ask_equipment → ask_training_days
  → ask_injuries
    |-- "Si" → ask_injuries_input → BLOQUE 5
    |-- "No" → BLOQUE 5
  |
  v
[BLOQUE 5: Estilo de vida]
  ask_wake_time (→ ask_wake_time_custom si "Otra")
  → ask_activity_level
  |
  v
[CONFIRMACION]
  confirm_profile
    |-- "Todo bien" → calculate_and_complete → FIN
    |-- "Corregir" → correct_block → re-ask bloque → confirm_profile
```

### Manejo de Errores

Identico al v1 con estos ajustes:

1. **Timeout de 48h** (era 24h): mensaje de retoma mas amigable: `Ey, parece que no terminamos tu registro. Quieres retomar donde lo dejamos o empezar de nuevo?` con botones `[ Retomar ]  [ Empezar de nuevo ]`
2. **Comando /cancelar**: `Cancelado. Cuando quieras retomar solo escribeme.` (sin mencionar /start)
3. **Mensaje inesperado**: se repite la pregunta actual SIN mensajes de error largos. Solo: `No entendi eso. [pregunta original]`

---

## 7. Comparacion v1 vs v2

| Aspecto | v1 | v2 |
|---|---|---|
| Pasos tipicos del usuario | 22+ intercambios | 17 intercambios |
| Confirmaciones intermedias | Despues de cada respuesta | Ninguna (solo resumen final breve) |
| Resumen final | 20+ campos listados | 5-6 datos clave |
| Correccion | Campo por campo (17 opciones) | Por bloque (5 opciones) |
| Mensaje de metricas | Lista tecnica (BMR, TDEE, macros) | Conversacional y contextualizado |
| Mensaje de cierre | Lista de comandos + "preguntame lo que necesites" | Plan del primer dia + como funciona el servicio |
| Transicion al coaching | Ninguna (bot se queda esperando) | Automatica (morning briefing programado) |
| Grasa corporal | Pregunta dedicada | Eliminada (se calcula despues si es necesario) |
| Restricciones + alergias | 4 pasos separados | 1-2 pasos combinados |
| Nivel de actividad | Al inicio (confuso) | Al final (despues de hablar de ejercicio) |
| TTL Redis | 24 horas | 48 horas |