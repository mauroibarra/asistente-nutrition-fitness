# FitAI Assistant - Flujo Completo de Onboarding (Telegram Bot)

> Documento de referencia para la implementacion del onboarding conversacional.
> Todo el contenido dirigido al usuario esta en espanol.
> Las variables se expresan como `{{variable}}`.

---

## 1. Mensaje de Bienvenida Inicial

**Trigger:** El usuario envia `/start` o es detectado como usuario nuevo (sin registro en la base de datos).

```text
Hola! Bienvenido a FitAI Assistant, tu asistente personal de nutricion y fitness.

Estoy aqui para ayudarte a alcanzar tus objetivos de salud con planes personalizados de alimentacion y entrenamiento.

Para crear tu plan necesito conocerte un poco mejor. Te hare algunas preguntas rapidas (aproximadamente 3 minutos).

Puedes escribir /cancelar en cualquier momento para detener el proceso.

Comencemos!
```

**Estado Redis inicial:**

```json
{
  "step": "welcome",
  "started_at": "{{iso_timestamp}}",
  "telegram_id": "{{telegram_id}}"
}
```

---

## 2. Secuencia de Preguntas

---

### Pregunta 1 - Nombre

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Como te gustaria que te llame?`                                      |
| **Tipo respuesta** | Texto libre                                                           |
| **Validacion**     | Entre 2 y 40 caracteres. Solo letras, espacios y guiones. Sin numeros ni caracteres especiales. |
| **Mensaje error**  | `Por favor ingresa un nombre valido (solo letras, entre 2 y 40 caracteres).` |
| **Variable**       | `{{first_name}}`                                                      |
| **Step Redis**     | `ask_name`                                                            |

---

### Pregunta 2 - Genero

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Gracias, {{first_name}}! Cual es tu genero biologico? Esto es importante para calcular tus requerimientos caloricos.` |
| **Tipo respuesta** | Inline keyboard                                                       |
| **Botones**        | `[ Hombre ]  [ Mujer ]`                                              |
| **Mapping**        | Hombre -> `male`, Mujer -> `female`                                   |
| **Validacion**     | Debe ser una de las opciones del teclado. Ignorar texto libre.        |
| **Mensaje error**  | `Por favor selecciona una de las opciones usando los botones de abajo.` |
| **Variable**       | `{{gender}}` (valores: `male`, `female`)                              |
| **Step Redis**     | `ask_gender`                                                          |

---

### Pregunta 3 - Edad

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cuantos anos tienes?`                                                |
| **Tipo respuesta** | Numero                                                                |
| **Validacion**     | Entero entre 14 y 100 inclusive.                                      |
| **Mensaje error**  | `Por favor ingresa una edad valida (un numero entre 14 y 100).`       |
| **Variable**       | `{{age}}`                                                             |
| **Step Redis**     | `ask_age`                                                             |

---

### Pregunta 4 - Estatura

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cual es tu estatura en centimetros? (por ejemplo: 170)`              |
| **Tipo respuesta** | Numero                                                                |
| **Validacion**     | Numero entre 100 y 250 inclusive. Acepta decimales con un decimal.    |
| **Mensaje error**  | `Por favor ingresa una estatura valida en centimetros (entre 100 y 250). Ejemplo: 170` |
| **Variable**       | `{{height_cm}}`                                                       |
| **Step Redis**     | `ask_height`                                                          |

---

### Pregunta 5 - Peso Actual

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cual es tu peso actual en kilogramos? (por ejemplo: 75)`             |
| **Tipo respuesta** | Numero                                                                |
| **Validacion**     | Numero entre 30 y 300 inclusive. Acepta decimales con un decimal.     |
| **Mensaje error**  | `Por favor ingresa un peso valido en kilogramos (entre 30 y 300). Ejemplo: 75` |
| **Variable**       | `{{weight_kg}}`                                                       |
| **Step Redis**     | `ask_weight`                                                          |

---

### Pregunta 6 - Porcentaje de Grasa Corporal

**Parte A: Pregunta inicial**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Conoces tu porcentaje de grasa corporal? Si no lo sabes, no te preocupes, no es obligatorio.` |
| **Tipo respuesta** | Inline keyboard                                                       |
| **Botones**        | `[ Si, lo conozco ]  [ No lo se ]`                                   |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una de las opciones usando los botones.`        |
| **Step Redis**     | `ask_body_fat_known`                                                  |

**Parte B: Si selecciona "Si, lo conozco"**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cual es tu porcentaje de grasa corporal? (por ejemplo: 20)`          |
| **Tipo respuesta** | Numero                                                                |
| **Validacion**     | Numero entre 3 y 60 inclusive. Acepta decimales con un decimal.       |
| **Mensaje error**  | `Por favor ingresa un porcentaje valido (un numero entre 3 y 60). Ejemplo: 20` |
| **Variable**       | `{{body_fat_percentage}}`                                             |
| **Step Redis**     | `ask_body_fat_value`                                                  |

**Si selecciona "No lo se":** Se establece `{{body_fat_percentage}}` como `null` y se avanza a la siguiente pregunta.

---

### Pregunta 7 - Nivel de Actividad

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cual es tu nivel de actividad fisica diaria? (sin contar entrenamientos planificados)` |
| **Tipo respuesta** | Inline keyboard (botones apilados verticalmente)                      |
| **Botones**        | Ver tabla abajo                                                       |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{activity_level}}`                                                  |
| **Step Redis**     | `ask_activity_level`                                                  |

**Opciones del teclado inline (una por fila):**

| Boton                                          | Valor enum         |
|------------------------------------------------|--------------------|
| `Sedentario (trabajo de escritorio, poco movimiento)` | `sedentary`        |
| `Ligeramente activo (camino algo, tareas ligeras)`    | `lightly_active`   |
| `Moderadamente activo (de pie, camino bastante)`      | `moderately_active`|
| `Muy activo (trabajo fisico, mucho movimiento)`       | `very_active`      |
| `Extra activo (trabajo muy fisico o doble entrenamiento)` | `extra_active` |

---

### Pregunta 8 - Experiencia con Ejercicio

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Como describirias tu experiencia con el ejercicio?`                  |
| **Tipo respuesta** | Inline keyboard                                                       |
| **Botones**        | Ver tabla abajo                                                       |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{fitness_level}}`                                                   |
| **Step Redis**     | `ask_fitness_level`                                                   |

| Boton                                                    | Valor            |
|----------------------------------------------------------|------------------|
| `Principiante (menos de 6 meses entrenando)`            | `beginner`       |
| `Intermedio (6 meses a 2 anos entrenando)`               | `intermediate`   |
| `Avanzado (mas de 2 anos entrenando consistentemente)`   | `advanced`       |

---

### Pregunta 9 - Objetivo Principal

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cual es tu objetivo principal?`                                      |
| **Tipo respuesta** | Inline keyboard (una opcion por fila)                                 |
| **Botones**        | Ver tabla abajo                                                       |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{goal_type}}`                                                       |
| **Step Redis**     | `ask_goal`                                                            |

| Boton                          | Valor enum       |
|--------------------------------|------------------|
| `Perder grasa`                 | `lose_fat`       |
| `Ganar musculo`                | `gain_muscle`    |
| `Mantener peso`                | `maintain`       |
| `Recomposicion corporal`       | `recomposition`  |

---

### Pregunta 10 - Restricciones Dietarias

**Parte A: Pregunta inicial**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Tienes alguna restriccion dietaria?`                                 |
| **Tipo respuesta** | Inline keyboard                                                       |
| **Botones**        | `[ Si ]  [ No ]`                                                     |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Step Redis**     | `ask_dietary_restrictions_known`                                      |

**Parte B: Si selecciona "Si"**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Selecciona tus restricciones dietarias (puedes elegir varias y presionar "Listo" al terminar). Tambien puedes escribirlas si no estan en la lista.` |
| **Tipo respuesta** | Inline keyboard multiselect + texto libre                             |
| **Botones**        | `[ Vegetariano ]  [ Vegano ]  [ Sin gluten ]  [ Sin lactosa ]  [ Otra ]  [ Listo ]` |
| **Nota Otra**      | Si selecciona "Otra", el bot responde: `Escribe tu restriccion dietaria:` y espera texto libre. |
| **Validacion**     | Texto libre: entre 2 y 200 caracteres. Al menos una seleccion antes de presionar "Listo". |
| **Mensaje error texto** | `Por favor describe tu restriccion dietaria (entre 2 y 200 caracteres).` |
| **Mensaje error listo**  | `Selecciona al menos una restriccion antes de presionar Listo.`  |
| **Variable**       | `{{dietary_restrictions}}` (array de strings)                         |
| **Step Redis**     | `ask_dietary_restrictions_select`                                     |

**Si selecciona "No":** Se establece `{{dietary_restrictions}}` como `[]` y se avanza.

---

### Pregunta 11 - Alergias Alimentarias

**Parte A: Pregunta inicial**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Tienes alguna alergia alimentaria?`                                  |
| **Tipo respuesta** | Inline keyboard                                                       |
| **Botones**        | `[ Si ]  [ No ]`                                                     |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Step Redis**     | `ask_allergies_known`                                                 |

**Parte B: Si selecciona "Si"**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Por favor escribe tus alergias alimentarias separadas por comas. Ejemplo: mani, mariscos, soya` |
| **Tipo respuesta** | Texto libre                                                           |
| **Validacion**     | Entre 2 y 300 caracteres.                                             |
| **Mensaje error**  | `Por favor escribe al menos una alergia (entre 2 y 300 caracteres).` |
| **Variable**       | `{{food_allergies}}` (array de strings, separados por coma y trimmed) |
| **Step Redis**     | `ask_allergies_input`                                                 |

**Si selecciona "No":** Se establece `{{food_allergies}}` como `[]` y se avanza.

---

### Pregunta 12 - Alimentos que No le Gustan

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Hay alimentos que no te gusten o prefieras evitar? Si no tienes ninguno, escribe "ninguno".` |
| **Tipo respuesta** | Texto libre                                                           |
| **Validacion**     | Entre 2 y 300 caracteres. Si escribe "ninguno", "no", "nada" o "ninguna", se guarda como array vacio. |
| **Mensaje error**  | `Por favor escribe los alimentos que prefieres evitar o "ninguno" si no tienes preferencia.` |
| **Variable**       | `{{disliked_foods}}` (array de strings, separados por coma y trimmed) |
| **Step Redis**     | `ask_disliked_foods`                                                  |

---

### Pregunta 13 - Lesiones o Condiciones Fisicas

**Parte A: Pregunta inicial**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Tienes alguna lesion o condicion fisica que limite tu ejercicio?`     |
| **Tipo respuesta** | Inline keyboard                                                       |
| **Botones**        | `[ Si ]  [ No ]`                                                     |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Step Redis**     | `ask_injuries_known`                                                  |

**Parte B: Si selecciona "Si"**

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Describe brevemente tu lesion o condicion. Ejemplo: dolor lumbar cronico, lesion de rodilla derecha` |
| **Tipo respuesta** | Texto libre                                                           |
| **Validacion**     | Entre 3 y 500 caracteres.                                             |
| **Mensaje error**  | `Por favor describe tu lesion o condicion (entre 3 y 500 caracteres).` |
| **Variable**       | `{{injuries}}` (string)                                               |
| **Step Redis**     | `ask_injuries_input`                                                  |

**Si selecciona "No":** Se establece `{{injuries}}` como `null` y se avanza.

---

### Pregunta 14 - Equipo Disponible

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Que equipo tienes disponible para entrenar?`                         |
| **Tipo respuesta** | Inline keyboard (una opcion por fila)                                 |
| **Botones**        | Ver tabla abajo                                                       |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{equipment}}`                                                       |
| **Step Redis**     | `ask_equipment`                                                       |

| Boton                                             | Valor              |
|---------------------------------------------------|---------------------|
| `En casa sin equipo (solo peso corporal)`         | `bodyweight`        |
| `En casa con equipo basico (mancuernas, bandas)`  | `home_basic`        |
| `Gimnasio completo`                               | `full_gym`          |

---

### Pregunta 15 - Dias de Entrenamiento por Semana

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cuantos dias a la semana puedes dedicar al entrenamiento?`           |
| **Tipo respuesta** | Inline keyboard (horizontal)                                         |
| **Botones**        | `[ 2 ]  [ 3 ]  [ 4 ]  [ 5 ]  [ 6 ]`                               |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{training_days_per_week}}` (entero)                                 |
| **Step Redis**     | `ask_training_days`                                                   |

---

### Pregunta 16 - Hora de Despertar

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `A que hora te despiertas normalmente? Esto me ayuda a planificar tus comidas.` |
| **Tipo respuesta** | Inline keyboard (una opcion por fila, 2 columnas)                    |
| **Botones**        | Ver tabla abajo                                                       |
| **Validacion**     | Debe ser una opcion del teclado o texto en formato HH:MM (24h).      |
| **Mensaje error**  | `Por favor selecciona una opcion o escribe la hora en formato HH:MM (ejemplo: 07:30).` |
| **Variable**       | `{{wake_up_time}}` (string formato "HH:MM")                          |
| **Step Redis**     | `ask_wake_time`                                                       |

| Boton         | Valor    |
|---------------|----------|
| `5:00 AM`     | `05:00`  |
| `5:30 AM`     | `05:30`  |
| `6:00 AM`     | `06:00`  |
| `6:30 AM`     | `06:30`  |
| `7:00 AM`     | `07:00`  |
| `7:30 AM`     | `07:30`  |
| `8:00 AM`     | `08:00`  |
| `8:30 AM`     | `08:30`  |
| `9:00 AM`     | `09:00`  |
| `Otra hora`   | _(pide texto libre)_ |

Si selecciona "Otra hora", el bot responde: `Escribe tu hora de despertar en formato HH:MM (ejemplo: 06:45)` y valida formato 24h entre 00:00 y 23:59.

---

### Pregunta 17 - Comidas por Dia

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Cuantas comidas al dia prefieres?`                                   |
| **Tipo respuesta** | Inline keyboard (horizontal)                                         |
| **Botones**        | `[ 3 ]  [ 4 ]  [ 5 ]`                                               |
| **Validacion**     | Debe ser una de las opciones del teclado.                             |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{meals_per_day}}` (entero)                                          |
| **Step Redis**     | `ask_meals`                                                           |

---

### Pregunta 18 - Presupuesto para Ingredientes

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Texto**          | `Por ultimo, ¿cual es tu presupuesto aproximado para comprar ingredientes?` |
| **Tipo respuesta** | Inline keyboard (vertical)                                           |
| **Botones**        | `[ 💰 Economico ]` → `low`<br>`[ 💰💰 Moderado ]` → `medium`<br>`[ 💰💰💰 Sin restriccion ]` → `high` |
| **Descripcion botones** | Economico: ingredientes accesibles y basicos / Moderado: balance entre precio y variedad / Sin restriccion: ingredientes premium o importados |
| **Validacion**     | Debe ser una de las opciones del teclado (`low`, `medium`, `high`).  |
| **Mensaje error**  | `Por favor selecciona una opcion usando los botones.`                 |
| **Variable**       | `{{budget_level}}` (string: `low` \| `medium` \| `high`)             |
| **Step Redis**     | `ask_budget`                                                          |

---

## 3. Logica de Ramificacion

El flujo es mayormente lineal con las siguientes bifurcaciones condicionales:

```
START
  |
  v
[1] ask_name
  |
  v
[2] ask_gender
  |
  v
[3] ask_age
  |
  v
[4] ask_height
  |
  v
[5] ask_weight
  |
  v
[6a] ask_body_fat_known
  |         \
  |          \-- "Si" --> [6b] ask_body_fat_value --> continuar
  |         /
  |-- "No" --> body_fat_percentage = null --> continuar
  |
  v
[7] ask_activity_level
  |
  v
[8] ask_fitness_level
  |
  v
[9] ask_goal
  |
  v
[10a] ask_dietary_restrictions_known
  |          \
  |           \-- "Si" --> [10b] ask_dietary_restrictions_select --> continuar
  |          /
  |-- "No" --> dietary_restrictions = [] --> continuar
  |
  v
[11a] ask_allergies_known
  |          \
  |           \-- "Si" --> [11b] ask_allergies_input --> continuar
  |          /
  |-- "No" --> food_allergies = [] --> continuar
  |
  v
[12] ask_disliked_foods
  |
  v
[13a] ask_injuries_known
  |          \
  |           \-- "Si" --> [13b] ask_injuries_input --> continuar
  |          /
  |-- "No" --> injuries = null --> continuar
  |
  v
[14] ask_equipment
  |
  v
[15] ask_training_days
  |
  v
[16] ask_wake_time
  |
  v
[17] ask_meals
  |
  v
[18] ask_budget
  |
  v
[RESUMEN] show_summary
  |
  v
[CONFIRMACION] confirm_profile
  |         \
  |          \-- "Corregir" --> ask_which_field --> re-ask that question --> show_summary
  |
  |-- "Confirmar" --> calcular indicadores --> save profile --> onboarding_complete
  |
  v
END
```

**Reglas de ramificacion:**

1. **Preguntas con sub-pregunta condicional (6, 10, 11, 13):** Si el usuario responde "Si", se presenta la sub-pregunta. Si responde "No", se guarda el valor por defecto y se avanza al siguiente paso principal.
2. **Pregunta 16 (hora de despertar):** Si selecciona "Otra hora", se solicita entrada de texto con validacion de formato.
3. **Pregunta 10 (restricciones dietarias):** Soporta seleccion multiple. El usuario puede presionar multiples opciones antes de "Listo". Si presiona "Otra", se pide texto libre y se vuelve al menu de seleccion.
4. **Resumen y confirmacion:** Tras completar todas las preguntas, se muestra el resumen. El usuario puede confirmar o corregir. Si corrige, se le pregunta cual campo quiere cambiar, se re-hace esa pregunta especifica, y se vuelve a mostrar el resumen.

---

## 4. Resumen del Perfil

**Trigger:** Se muestra despues de la ultima pregunta, antes de la confirmacion.

```text
Perfecto, {{first_name}}! Este es el resumen de tu perfil:

--- Datos personales ---
Nombre: {{first_name}}
Genero: {{gender_display}}
Edad: {{age}} anos
Estatura: {{height_cm}} cm
Peso: {{weight_kg}} kg
Grasa corporal: {{body_fat_display}}

--- Actividad y experiencia ---
Nivel de actividad: {{activity_level_display}}
Experiencia: {{fitness_level_display}}
Objetivo: {{goal_type_display}}

--- Alimentacion ---
Restricciones: {{dietary_restrictions_display}}
Alergias: {{food_allergies_display}}
Alimentos a evitar: {{disliked_foods_display}}
Comidas al dia: {{meals_per_day}}
Presupuesto: {{budget_display}}

--- Entrenamiento ---
Lesiones/condiciones: {{injuries_display}}
Equipo disponible: {{equipment_display}}
Dias de entrenamiento: {{training_days_per_week}} dias/semana

--- Horario ---
Hora de despertar: {{wake_up_time}}

Esta todo correcto?
```

**Botones inline:**

```
[ Confirmar ]  [ Corregir un dato ]
```

**Mapping de valores para display:**

| Variable                   | Valor interno        | Texto display                     |
|----------------------------|----------------------|-----------------------------------|
| `gender`                   | `male`               | `Hombre`                          |
| `gender`                   | `female`             | `Mujer`                           |
| `body_fat_percentage`      | `null`               | `No especificado`                 |
| `body_fat_percentage`      | `{number}`           | `{number}%`                       |
| `activity_level`           | `sedentary`          | `Sedentario`                      |
| `activity_level`           | `lightly_active`     | `Ligeramente activo`              |
| `activity_level`           | `moderately_active`  | `Moderadamente activo`            |
| `activity_level`           | `very_active`        | `Muy activo`                      |
| `activity_level`           | `extra_active`       | `Extra activo`                    |
| `fitness_level`            | `beginner`           | `Principiante`                    |
| `fitness_level`            | `intermediate`       | `Intermedio`                      |
| `fitness_level`            | `advanced`           | `Avanzado`                        |
| `goal_type`                | `lose_fat`           | `Perder grasa`                    |
| `goal_type`                | `gain_muscle`        | `Ganar musculo`                   |
| `goal_type`                | `maintain`           | `Mantener peso`                   |
| `goal_type`                | `recomposition`      | `Recomposicion corporal`          |
| `dietary_restrictions`     | `[]`                 | `Ninguna`                         |
| `food_allergies`           | `[]`                 | `Ninguna`                         |
| `disliked_foods`           | `[]`                 | `Ninguno`                         |
| `budget_level`             | `'medium'`           | `Moderado`                        |
| `injuries`                 | `null`               | `Ninguna`                         |
| `equipment`                | `bodyweight`         | `En casa sin equipo`              |
| `equipment`                | `home_basic`         | `En casa con equipo basico`       |
| `equipment`                | `full_gym`           | `Gimnasio completo`               |

**Si selecciona "Corregir un dato":**

```text
Que dato quieres corregir? Selecciona una opcion:
```

Botones inline (apilados verticalmente):

```
[ Nombre ]
[ Genero ]
[ Edad ]
[ Estatura ]
[ Peso ]
[ Grasa corporal ]
[ Nivel de actividad ]
[ Experiencia ]
[ Objetivo ]
[ Restricciones dietarias ]
[ Alergias ]
[ Alimentos a evitar ]
[ Lesiones ]
[ Equipo ]
[ Dias de entrenamiento ]
[ Hora de despertar ]
[ Comidas al dia ]
```

Al seleccionar un campo, se re-hace la pregunta correspondiente. Al recibir la respuesta, se actualiza el valor y se vuelve a mostrar el resumen completo.

---

## 5. Calculo y Presentacion de Indicadores

**Trigger:** El usuario confirma el resumen.

### 5.1 BMI (Indice de Masa Corporal)

**Formula:**

```
BMI = weight_kg / (height_cm / 100)^2
```

**Categorias:**

| Rango BMI        | Categoria          |
|------------------|--------------------|
| < 18.5           | Bajo peso          |
| 18.5 - 24.9      | Peso normal        |
| 25.0 - 29.9      | Sobrepeso          |
| >= 30.0           | Obesidad           |

### 5.2 BMR (Tasa Metabolica Basal) - Mifflin-St Jeor

**Formula:**

```
Si gender == male:
    BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5

Si gender == female:
    BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
```

### 5.3 TDEE (Gasto Energetico Diario Total)

**Formula:**

```
TDEE = BMR * activity_multiplier
```

**Multiplicadores de actividad:**

| Nivel de actividad   | Multiplicador |
|----------------------|---------------|
| `sedentary`          | 1.2           |
| `lightly_active`     | 1.375         |
| `moderately_active`  | 1.55          |
| `very_active`        | 1.725         |
| `extra_active`       | 1.9           |

### 5.4 Objetivo Calorico

| Objetivo          | Calculo                        |
|-------------------|--------------------------------|
| `lose_fat`        | `TDEE - 500` (deficit moderado)|
| `gain_muscle`     | `TDEE + 300` (superavit ligero)|
| `maintain`        | `TDEE`                         |
| `recomposition`   | `TDEE - 100` (deficit minimo)  |

El objetivo calorico se redondea al multiplo de 50 mas cercano. Se establece un minimo absoluto de 1200 kcal para mujeres y 1500 kcal para hombres.

### 5.5 Macronutrientes

**Proteina:**

| Objetivo          | Proteina (g/kg peso corporal)  |
|-------------------|--------------------------------|
| `lose_fat`        | 2.2                            |
| `gain_muscle`     | 2.0                            |
| `maintain`        | 1.8                            |
| `recomposition`   | 2.2                            |

```
protein_g = weight_kg * protein_per_kg
protein_kcal = protein_g * 4
```

**Grasa:**

```
fat_kcal = caloric_target * 0.25
fat_g = fat_kcal / 9
```

**Carbohidratos (el resto):**

```
carbs_kcal = caloric_target - protein_kcal - fat_kcal
carbs_g = carbs_kcal / 4
```

Todos los macros se redondean al entero mas cercano.

### 5.6 Mensaje de Presentacion de Indicadores

```text
He calculado tus indicadores personalizados:

--- Tu cuerpo ---
IMC: {{bmi}} ({{bmi_category}})
Metabolismo basal (BMR): {{bmr}} kcal/dia
Gasto total diario (TDEE): {{tdee}} kcal/dia

--- Tu plan nutricional ---
Objetivo: {{goal_type_display}}
Calorias diarias: {{caloric_target}} kcal

Macronutrientes diarios:
  Proteina: {{protein_g}}g ({{protein_kcal}} kcal)
  Carbohidratos: {{carbs_g}}g ({{carbs_kcal}} kcal)
  Grasas: {{fat_g}}g ({{fat_kcal}} kcal)

Estos valores son tu punto de partida. Los iremos ajustando segun tu progreso.
```

---

## 6. Mensaje de Cierre del Onboarding

```text
Tu perfil esta listo, {{first_name}}!

Esto es lo que puedo hacer por ti:

/plan - Ver tu plan de comidas de hoy
/entrenamiento - Ver tu rutina de entrenamiento de hoy
/progreso - Registrar tu peso y ver tu progreso
/resumen - Ver un resumen de tu perfil y macros
/ajustar - Modificar tus datos o preferencias

Tambien puedes enviarme una foto de tu comida y te dire su informacion nutricional aproximada.

Empecemos! Quieres ver tu plan de comidas para hoy o tu rutina de entrenamiento?
```

**Botones inline:**

```
[ Ver plan de comidas ]  [ Ver rutina de entrenamiento ]
```

---

## 7. Gestion de Estado en Redis

### Clave Redis

```
onboarding:{telegram_id}
```

**Ejemplo:** `onboarding:123456789`

### TTL

**24 horas (86400 segundos).** Si el usuario no completa el onboarding en 24 horas, el estado expira y debera reiniciar con `/start`.

### Estructura del Estado

```json
{
  "telegram_id": 123456789,
  "step": "ask_name",
  "started_at": "2026-03-26T10:00:00Z",
  "updated_at": "2026-03-26T10:01:30Z",
  "data": {
    "first_name": null,
    "gender": null,
    "age": null,
    "height_cm": null,
    "weight_kg": null,
    "body_fat_percentage": null,
    "activity_level": null,
    "fitness_level": null,
    "goal_type": null,
    "dietary_restrictions": [],
    "food_allergies": [],
    "disliked_foods": [],
    "budget_level": "medium",
    "injuries": null,
    "equipment": null,
    "training_days_per_week": null,
    "wake_up_time": null,
    "meals_per_day": null
  },
  "temp": {
    "dietary_restrictions_selected": [],
    "awaiting_custom_restriction": false,
    "awaiting_custom_wake_time": false
  }
}
```

### Campos del Estado

| Campo          | Descripcion                                                        |
|----------------|--------------------------------------------------------------------|
| `telegram_id`  | ID de Telegram del usuario.                                        |
| `step`         | Paso actual del onboarding. Determina que pregunta mostrar y que respuesta esperar. |
| `started_at`   | Timestamp ISO 8601 de inicio del onboarding.                       |
| `updated_at`   | Timestamp ISO 8601 de la ultima actualizacion.                     |
| `data`         | Objeto con todas las respuestas recopiladas. Los campos inician en `null` y se llenan conforme avanza el flujo. |
| `temp`         | Datos temporales para manejar sub-flujos (seleccion multiple, texto custom). Se eliminan al guardar el perfil. |

### Valores Validos para `step`

```
welcome
ask_name
ask_gender
ask_age
ask_height
ask_weight
ask_body_fat_known
ask_body_fat_value
ask_activity_level
ask_fitness_level
ask_goal
ask_dietary_restrictions_known
ask_dietary_restrictions_select
ask_allergies_known
ask_allergies_input
ask_disliked_foods
ask_budget
ask_injuries_known
ask_injuries_input
ask_equipment
ask_training_days
ask_wake_time
ask_wake_time_custom
ask_meals
show_summary
confirm_profile
correct_field
onboarding_complete
```

### Operaciones Redis

**Crear estado (al iniciar onboarding):**

```
SET onboarding:{telegram_id} {json_state} EX 86400
```

**Actualizar estado (al recibir cada respuesta):**

```
SET onboarding:{telegram_id} {updated_json_state} EX 86400
```

Se renueva el TTL con cada actualizacion para que el reloj de 24h se reinicie con cada interaccion.

**Leer estado (al recibir cualquier mensaje):**

```
GET onboarding:{telegram_id}
```

Si retorna `null`, el usuario no tiene onboarding en curso. Verificar si tiene perfil completo en la base de datos. Si no tiene perfil, iniciar onboarding.

**Eliminar estado (al completar onboarding):**

```
DEL onboarding:{telegram_id}
```

Se elimina despues de guardar exitosamente el perfil en la base de datos.

### Manejo de Errores y Casos Especiales

1. **Timeout de 24h:** Si el estado expira, al recibir un nuevo mensaje del usuario se detecta que no tiene estado Redis ni perfil en BD. Se inicia el onboarding desde cero con un mensaje: `Parece que no completaste tu registro anterior. Empecemos de nuevo!`

2. **Comando /cancelar durante onboarding:** Se elimina el estado Redis y se envia: `Has cancelado el registro. Puedes volver a empezar en cualquier momento con /start.`

3. **Comando /start durante onboarding en curso:** Se pregunta al usuario: `Ya tienes un registro en curso. Quieres continuar donde lo dejaste o empezar de nuevo?` con botones `[ Continuar ]  [ Empezar de nuevo ]`.

4. **Mensaje inesperado (no coincide con validacion del paso actual):** Se muestra el mensaje de error correspondiente al paso actual y se repite la pregunta.

5. **Callback query de un paso anterior (usuario presiona boton viejo):** Se ignora y se responde con `answer_callback_query` indicando: `Esta opcion ya no esta disponible. Por favor responde a la pregunta actual.`

6. **Concurrencia:** Se usa el patron read-modify-write con la clave Redis. En caso de conflicto, la ultima escritura gana. Dado que es un flujo de un solo usuario, la concurrencia no deberia ser un problema en la practica.
