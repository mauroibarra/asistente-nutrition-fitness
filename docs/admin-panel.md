# Panel de Administracion — FitAI Assistant

## 1. Tecnologia y Justificacion

### Stack Tecnologico

| Componente | Libreria | Version |
|------------|----------|---------|
| Servidor web | Express.js | ^4.18 |
| Motor de templates | EJS | ^3.1 |
| Sesiones | express-session | ^1.17 |
| Hashing de passwords | bcrypt | ^5.1 |
| Cliente PostgreSQL | pg | ^8.11 |
| Variables de entorno | dotenv | ^16.3 |

### Por que Express + EJS y no React/Next.js/Retool

Se evaluo usar un framework SPA (React, Vue) o una plataforma low-code (Retool, Appsmith). Se descartaron por las siguientes razones:

| Criterio | Express + EJS | React SPA | Retool |
|----------|---------------|-----------|--------|
| Tamano Docker image | ~80 MB | ~250 MB | SaaS (no self-hosted) |
| Dependencias npm | 6 | 40+ | N/A |
| Autenticacion | express-session (simple) | JWT + refresh tokens | Propia |
| Curva de aprendizaje | Minima (HTML + JS) | Alta (state management, routing) | Media |
| Usuarios concurrentes esperados | 1-2 admins | N/A | N/A |
| Control total de UI | Si | Si | No |
| Mismo runtime que n8n | Si (Node.js) | Si (build) | No |

**Conclusion**: Para un panel que servira a 1-2 administradores, Express + EJS ofrece el menor footprint posible, cero complejidad de build, autenticacion trivial con sesiones, y comparte el mismo stack Node.js que n8n. No hay justificacion para introducir un framework SPA con su complejidad inherente.

---

## 2. Wireframes de Pantallas

### 2.1 Pantalla de Login

```
+----------------------------------------------------------+
|                                                          |
|                    FitAI Assistant                        |
|                   Panel de Administracion                |
|                                                          |
|            +--------------------------------+            |
|            |  Email                         |            |
|            |  admin@fitai.com               |            |
|            +--------------------------------+            |
|            +--------------------------------+            |
|            |  Contrasena                    |            |
|            |  ********                      |            |
|            +--------------------------------+            |
|                                                          |
|            [        Iniciar Sesion          ]            |
|                                                          |
|            ! Email o contrasena incorrectos              |
|                                                          |
+----------------------------------------------------------+
```

### 2.2 Dashboard Principal

```
+----------------------------------------------------------+
| FitAI Admin          Dashboard | Usuarios | Pagos | Salir|
+----------------------------------------------------------+
|                                                          |
|  +------------+  +------------+  +------------+  +------+
|  | TOTAL      |  | MEMBRESIAS |  | POR VENCER |  | INGR.|
|  | USUARIOS   |  | ACTIVAS    |  | (7 dias)   |  | MES  |
|  |            |  |            |  |            |  |      |
|  |    147     |  |     83     |  |     12     |  |$24,  |
|  |            |  |            |  |            |  | 500  |
|  | +3 esta    |  | 56% del    |  | Requieren  |  | MXN  |
|  |  semana    |  |  total     |  |  atencion  |  |      |
|  +------------+  +------------+  +------------+  +------+
|                                                          |
|  MEMBRESIAS POR VENCER PRONTO                            |
|  +------------------------------------------------------+|
|  | Nombre        | Plan    | Expira     | Acciones      ||
|  |---------------|---------|------------|---------------||
|  | Maria Lopez   | pro     | 2026-04-01 | [Renovar]     ||
|  | Juan Perez    | basic   | 2026-04-02 | [Renovar]     ||
|  | Ana Garcia    | premium | 2026-03-30 | [Renovar]     ||
|  | Carlos Ruiz   | basic   | 2026-03-31 | [Renovar]     ||
|  | Sofia Torres  | pro     | 2026-04-03 | [Renovar]     ||
|  +------------------------------------------------------+|
|                                                          |
|  ULTIMOS PAGOS REGISTRADOS                               |
|  +------------------------------------------------------+|
|  | Fecha      | Usuario       | Monto    | Metodo       ||
|  |------------|---------------|----------|-------------||
|  | 2026-03-25 | Maria Lopez   | $499.00  | transfer     ||
|  | 2026-03-24 | Pedro Sanchez | $799.00  | card         ||
|  | 2026-03-24 | Luis Ramirez  | $499.00  | transfer     ||
|  | 2026-03-23 | Ana Garcia    | $1199.00 | transfer     ||
|  +------------------------------------------------------+|
|                                                          |
+----------------------------------------------------------+
```

### 2.3 Lista de Usuarios

```
+----------------------------------------------------------+
| FitAI Admin          Dashboard | Usuarios | Pagos | Salir|
+----------------------------------------------------------+
|                                                          |
|  Usuarios                          [+ Nuevo Usuario]     |
|                                                          |
|  Filtros:                                                |
|  Status: [Todos v]  Plan: [Todos v]  Buscar: [________] |
|                                                          |
|  +------------------------------------------------------+|
|  | Nombre        | Telegram ID | Plan    | Status  | Exp||
|  |               |             |         |         | ira||
|  |---------------|-------------|---------|---------|----||
|  | Maria Lopez   | 123456789   | pro     | active  | 20 ||
|  |               |             |         |         | 26-||
|  |               |             |         |         | 04-||
|  |               |             |         |         | 01 ||
|  |               |             |         |   [Ver] [Pau]||
|  |---------------|-------------|---------|---------|----||
|  | Juan Perez    | 987654321   | basic   | active  | 20 ||
|  |               |             |         |         | 26-||
|  |               |             |         |         | 04-||
|  |               |             |         |         | 02 ||
|  |               |             |         |   [Ver] [Pau]||
|  |---------------|-------------|---------|---------|----||
|  | Pedro Sanchez | 555111222   | pro     | expired | 20 ||
|  |               |             |         |         | 26-||
|  |               |             |         |         | 03-||
|  |               |             |         |         | 15 ||
|  |               |             |         |   [Ver] [Act]||
|  |---------------|-------------|---------|---------|----||
|  | Rosa Diaz     | 333444555   | premium | paused  | 20 ||
|  |               |             |         |         | 26-||
|  |               |             |         |         | 05-||
|  |               |             |         |         | 10 ||
|  |               |             |         |   [Ver] [Act]||
|  +------------------------------------------------------+|
|                                                          |
|  Mostrando 1-20 de 147       [< Anterior] [Siguiente >] |
|                                                          |
+----------------------------------------------------------+
```

### 2.4 Detalle de Usuario

```
+----------------------------------------------------------+
| FitAI Admin          Dashboard | Usuarios | Pagos | Salir|
+----------------------------------------------------------+
|                                                          |
|  [< Volver a lista]                                     |
|                                                          |
|  INFORMACION DEL USUARIO                                 |
|  +------------------------------------------------------+|
|  | Nombre:       Maria Lopez                            ||
|  | Telegram ID:  123456789                              ||
|  | Username:     @marialopez                            ||
|  | Registrada:   2026-01-15                             ||
|  | Idioma:       es                                     ||
|  +------------------------------------------------------+|
|                                                          |
|  MEMBRESIA ACTUAL                                        |
|  +------------------------------------------------------+|
|  | Plan:         pro                                    ||
|  | Status:       active                                 ||
|  | Inicio:       2026-03-01                             ||
|  | Expira:       2026-04-01                             ||
|  | Dias restantes: 6                                    ||
|  |                                                      ||
|  | [Pausar]  [Cancelar]  [Renovar]                      ||
|  +------------------------------------------------------+|
|                                                          |
|  PERFIL DE SALUD                                         |
|  +------------------------------------------------------+|
|  | Genero: female  | Edad: 28    | Altura: 165 cm      ||
|  | Peso actual: 68.5 kg | Grasa corporal: 28%          ||
|  | Nivel actividad: moderately_active                   ||
|  | Nivel fitness: intermediate                          ||
|  | Objetivo: lose_weight                                ||
|  | Calorias target: 1650 kcal | Proteina: 120g         ||
|  | Restricciones: lactose_free                          ||
|  | Onboarding: Completado (2026-01-15)                  ||
|  +------------------------------------------------------+|
|                                                          |
|  HISTORIAL DE PESO                                       |
|  +------------------------------------------------------+|
|  |  72 |*                                               ||
|  |  71 | *                                              ||
|  |  70 |  *  *                                          ||
|  |  69 |      *  *                                      ||
|  |  68 |            *  *  *                             ||
|  |  67 |                                                ||
|  |  kg +--+--+--+--+--+--+--+--+--+--+                 ||
|  |     Ene   Feb   Mar                                  ||
|  |                                                      ||
|  | Peso inicial: 72.0 kg | Peso actual: 68.5 kg        ||
|  | Cambio total: -3.5 kg | Promedio semanal: -0.35 kg  ||
|  +------------------------------------------------------+|
|                                                          |
|  HISTORIAL DE PAGOS                                      |
|  +------------------------------------------------------+|
|  | Fecha      | Monto    | Metodo   | Referencia       ||
|  |------------|----------|----------|------------------||
|  | 2026-03-01 | $799.00  | transfer | BBVA ref 98765   ||
|  | 2026-02-01 | $799.00  | transfer | BBVA ref 87654   ||
|  | 2026-01-15 | $799.00  | card     | Primer pago      ||
|  +------------------------------------------------------+|
|                                                          |
|  [Registrar Pago]  [Editar Usuario]                      |
|                                                          |
+----------------------------------------------------------+
```

### 2.5 Formulario de Alta de Usuario

```
+----------------------------------------------------------+
| FitAI Admin          Dashboard | Usuarios | Pagos | Salir|
+----------------------------------------------------------+
|                                                          |
|  Nuevo Usuario                                           |
|                                                          |
|  +------------------------------------------------------+|
|  |                                                      ||
|  |  Telegram ID *                                       ||
|  |  +------------------------------------------------+ ||
|  |  | 123456789                                       | ||
|  |  +------------------------------------------------+ ||
|  |  (ID numerico de Telegram, no el @username)          ||
|  |                                                      ||
|  |  Nombre *                                            ||
|  |  +------------------------------------------------+ ||
|  |  | Maria                                           | ||
|  |  +------------------------------------------------+ ||
|  |                                                      ||
|  |  Apellido                                            ||
|  |  +------------------------------------------------+ ||
|  |  | Lopez                                           | ||
|  |  +------------------------------------------------+ ||
|  |                                                      ||
|  |  Plan *                                              ||
|  |  +------------------------------------------------+ ||
|  |  | pro                                          v  | ||
|  |  +------------------------------------------------+ ||
|  |  Opciones: basic ($499/mes), pro ($799/mes),         ||
|  |            premium ($1199/mes)                       ||
|  |                                                      ||
|  |  Duracion (meses) *                                  ||
|  |  +------------------------------------------------+ ||
|  |  | 1                                            v  | ||
|  |  +------------------------------------------------+ ||
|  |  Opciones: 1, 3, 6, 12                              ||
|  |                                                      ||
|  |  Al crear el usuario se generara automaticamente:    ||
|  |  - Registro en tabla users                           ||
|  |  - Membresia con status 'active'                     ||
|  |  - Fecha de expiracion calculada segun duracion      ||
|  |                                                      ||
|  |  [Cancelar]                [Crear Usuario]           ||
|  |                                                      ||
|  +------------------------------------------------------+|
|                                                          |
+----------------------------------------------------------+
```

### 2.6 Formulario de Registro de Pago

```
+----------------------------------------------------------+
| FitAI Admin          Dashboard | Usuarios | Pagos | Salir|
+----------------------------------------------------------+
|                                                          |
|  Registrar Pago                                          |
|                                                          |
|  +------------------------------------------------------+|
|  |                                                      ||
|  |  Usuario *                                           ||
|  |  +------------------------------------------------+ ||
|  |  | Buscar por nombre o Telegram ID...           v  | ||
|  |  +------------------------------------------------+ ||
|  |  Seleccionado: Maria Lopez (123456789) - pro        ||
|  |                                                      ||
|  |  Monto (MXN) *                                      ||
|  |  +------------------------------------------------+ ||
|  |  | 799.00                                          | ||
|  |  +------------------------------------------------+ ||
|  |                                                      ||
|  |  Metodo de Pago *                                    ||
|  |  +------------------------------------------------+ ||
|  |  | transfer                                     v  | ||
|  |  +------------------------------------------------+ ||
|  |  Opciones: transfer, cash, card, other              ||
|  |                                                      ||
|  |  Referencia / Nota                                   ||
|  |  +------------------------------------------------+ ||
|  |  | Transferencia BBVA ref 12345                    | ||
|  |  +------------------------------------------------+ ||
|  |                                                      ||
|  |  Fecha de Pago *                                     ||
|  |  +------------------------------------------------+ ||
|  |  | 2026-03-26                                      | ||
|  |  +------------------------------------------------+ ||
|  |  (Por defecto: fecha actual)                         ||
|  |                                                      ||
|  |  [Cancelar]              [Registrar Pago]            ||
|  |                                                      ||
|  +------------------------------------------------------+|
|                                                          |
+----------------------------------------------------------+
```

---

## 3. Rutas y Endpoints del Panel

### Tabla de Rutas

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/login` | No | Pagina de login |
| POST | `/login` | No | Autenticar admin |
| GET | `/logout` | Si | Destruir sesion y redirigir a /login |
| GET | `/` | Si | Dashboard con metricas globales |
| GET | `/users` | Si | Lista de usuarios con filtros |
| GET | `/users/new` | Si | Formulario de alta de usuario |
| GET | `/users/:id` | Si | Detalle de un usuario |
| POST | `/users` | Si | Crear usuario + membresia |
| PUT | `/users/:id` | Si | Actualizar datos de usuario |
| POST | `/users/:id/activate` | Si | Activar membresia |
| POST | `/users/:id/pause` | Si | Pausar membresia |
| POST | `/users/:id/cancel` | Si | Cancelar membresia |
| GET | `/payments` | Si | Lista de pagos |
| POST | `/payments` | Si | Registrar nuevo pago |
| GET | `/health` | No | Health check (para Docker/nginx) |

### Implementacion Completa de Rutas

#### Archivo: `src/app.js` — Configuracion del servidor

```javascript
const express = require('express');
const session = require('express-session');
const path = require('path');
const { pool } = require('./db');
const { requireAuth } = require('./middleware/auth');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'fitai-admin-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// Make session user available in all templates
app.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  next();
});

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (no auth middleware)
app.use('/', authRoutes);

// Protected routes
app.use('/', requireAuth, dashboardRoutes);
app.use('/users', requireAuth, userRoutes);
app.use('/payments', requireAuth, paymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { message: 'Pagina no encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).render('error', { message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Admin panel running on port ${PORT}`);
});

module.exports = app;
```

#### Archivo: `src/db.js` — Conexion a PostgreSQL

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT NOW()')
  .then(() => console.log('PostgreSQL connected'))
  .catch((err) => {
    console.error('PostgreSQL connection failed:', err.message);
    process.exit(1);
  });

module.exports = { pool };
```

#### Archivo: `src/middleware/auth.js` — Middleware de autenticacion

```javascript
function requireAuth(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { requireAuth };
```

#### Archivo: `src/routes/auth.js` — Login y Logout

```javascript
const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const router = express.Router();

// GET /login — Render login page
router.get('/login', (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// POST /login — Authenticate admin
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { error: 'Email y contrasena son requeridos' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, is_active FROM admin_users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.render('login', { error: 'Email o contrasena incorrectos' });
    }

    const admin = result.rows[0];

    if (!admin.is_active) {
      return res.render('login', { error: 'Cuenta desactivada. Contacta al administrador principal.' });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      return res.render('login', { error: 'Email o contrasena incorrectos' });
    }

    // Update last login timestamp
    await pool.query(
      'UPDATE admin_users SET last_login_at = NOW() WHERE id = $1',
      [admin.id]
    );

    // Create session
    req.session.admin = {
      id: admin.id,
      email: admin.email,
      fullName: admin.full_name
    };

    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err.message);
    res.render('login', { error: 'Error interno. Intenta de nuevo.' });
  }
});

// GET /logout — Destroy session
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err.message);
    res.redirect('/login');
  });
});

module.exports = router;
```

#### Archivo: `src/routes/dashboard.js` — Dashboard con metricas

```javascript
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET / — Dashboard
router.get('/', async (req, res) => {
  try {
    // Execute all dashboard queries in parallel
    const [
      totalUsersResult,
      activeMembershipsResult,
      expiringResult,
      revenueResult,
      expiringListResult,
      recentPaymentsResult
    ] = await Promise.all([
      // Total users
      pool.query('SELECT COUNT(*) AS count FROM users'),

      // Active memberships
      pool.query(
        `SELECT COUNT(*) AS count FROM memberships
         WHERE status = 'active' AND expires_at > NOW()`
      ),

      // Expiring within 7 days
      pool.query(
        `SELECT COUNT(*) AS count FROM memberships
         WHERE status = 'active'
           AND expires_at > NOW()
           AND expires_at <= NOW() + INTERVAL '7 days'`
      ),

      // Revenue this month
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_logs
         WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)
           AND payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`
      ),

      // List of expiring memberships (for the table)
      pool.query(
        `SELECT u.id, u.first_name, u.last_name, m.plan_type, m.expires_at
         FROM users u
         JOIN memberships m ON u.id = m.user_id
         WHERE m.status = 'active'
           AND m.expires_at > NOW()
           AND m.expires_at <= NOW() + INTERVAL '7 days'
         ORDER BY m.expires_at ASC
         LIMIT 10`
      ),

      // Recent payments
      pool.query(
        `SELECT pl.payment_date, u.first_name, u.last_name,
                pl.amount, pl.payment_method
         FROM payment_logs pl
         JOIN users u ON pl.user_id = u.id
         ORDER BY pl.created_at DESC
         LIMIT 5`
      )
    ]);

    res.render('dashboard', {
      totalUsers: parseInt(totalUsersResult.rows[0].count),
      activeMemberships: parseInt(activeMembershipsResult.rows[0].count),
      expiringSoon: parseInt(expiringResult.rows[0].count),
      revenueThisMonth: parseFloat(revenueResult.rows[0].total),
      expiringList: expiringListResult.rows,
      recentPayments: recentPaymentsResult.rows
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).render('error', { message: 'Error cargando el dashboard' });
  }
});

module.exports = router;
```

#### Archivo: `src/routes/users.js` — CRUD de usuarios y membresias

```javascript
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /users — List users with filters
router.get('/', async (req, res) => {
  const { status, plan, search, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  let query = `
    SELECT u.id, u.first_name, u.last_name, u.telegram_id,
           m.plan_type, m.status, m.expires_at
    FROM users u
    LEFT JOIN memberships m ON u.id = m.user_id
      AND m.id = (
        SELECT id FROM memberships
        WHERE user_id = u.id
        ORDER BY created_at DESC LIMIT 1
      )
    WHERE 1=1
  `;
  let countQuery = `
    SELECT COUNT(*) AS total
    FROM users u
    LEFT JOIN memberships m ON u.id = m.user_id
      AND m.id = (
        SELECT id FROM memberships
        WHERE user_id = u.id
        ORDER BY created_at DESC LIMIT 1
      )
    WHERE 1=1
  `;

  const params = [];
  const countParams = [];
  let paramIndex = 1;

  if (status && status !== 'all') {
    const clause = ` AND m.status = $${paramIndex}`;
    query += clause;
    countQuery += clause;
    params.push(status);
    countParams.push(status);
    paramIndex++;
  }

  if (plan && plan !== 'all') {
    const clause = ` AND m.plan_type = $${paramIndex}`;
    query += clause;
    countQuery += clause;
    params.push(plan);
    countParams.push(plan);
    paramIndex++;
  }

  if (search) {
    const clause = ` AND (
      u.first_name ILIKE $${paramIndex}
      OR u.last_name ILIKE $${paramIndex}
      OR u.telegram_id::TEXT LIKE $${paramIndex}
    )`;
    query += clause;
    countQuery += clause;
    params.push(`%${search}%`);
    countParams.push(`%${search}%`);
    paramIndex++;
  }

  query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  try {
    const [usersResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    const totalUsers = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render('users/list', {
      users: usersResult.rows,
      filters: { status, plan, search },
      pagination: {
        page: parseInt(page),
        totalPages,
        totalUsers
      }
    });
  } catch (err) {
    console.error('User list error:', err.message);
    res.status(500).render('error', { message: 'Error cargando usuarios' });
  }
});

// GET /users/new — New user form
router.get('/new', (req, res) => {
  res.render('users/new', { error: null });
});

// GET /users/:id — User detail
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [userResult, membershipResult, profileResult, paymentsResult, weightsResult] =
      await Promise.all([
        // User info
        pool.query(
          'SELECT * FROM users WHERE id = $1',
          [id]
        ),
        // Current membership
        pool.query(
          `SELECT * FROM memberships
           WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [id]
        ),
        // Health profile
        pool.query(
          'SELECT * FROM user_profiles WHERE user_id = $1',
          [id]
        ),
        // Payment history
        pool.query(
          `SELECT pl.*, au.full_name AS registered_by_name
           FROM payment_logs pl
           LEFT JOIN admin_users au ON pl.registered_by = au.id
           WHERE pl.user_id = $1
           ORDER BY pl.payment_date DESC`,
          [id]
        ),
        // Weight logs (last 12 entries for chart)
        pool.query(
          `SELECT weight_kg, body_fat_pct, logged_at
           FROM weight_logs
           WHERE user_id = $1
           ORDER BY logged_at DESC
           LIMIT 12`,
          [id]
        )
      ]);

    if (userResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Usuario no encontrado' });
    }

    res.render('users/detail', {
      user: userResult.rows[0],
      membership: membershipResult.rows[0] || null,
      profile: profileResult.rows[0] || null,
      payments: paymentsResult.rows,
      weights: weightsResult.rows.reverse() // Chronological order for chart
    });
  } catch (err) {
    console.error('User detail error:', err.message);
    res.status(500).render('error', { message: 'Error cargando detalle del usuario' });
  }
});

// POST /users — Create user + membership
router.post('/', async (req, res) => {
  const { telegram_id, first_name, last_name, plan_type, duration_months } = req.body;

  if (!telegram_id || !first_name || !plan_type || !duration_months) {
    return res.render('users/new', {
      error: 'Telegram ID, nombre, plan y duracion son obligatorios'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert user
    const userResult = await client.query(
      `INSERT INTO users (telegram_id, first_name, last_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [telegram_id, first_name, last_name || null]
    );
    const userId = userResult.rows[0].id;

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + parseInt(duration_months));

    // Create active membership
    await client.query(
      `INSERT INTO memberships (user_id, plan_type, status, starts_at, expires_at)
       VALUES ($1, $2, 'active', NOW(), $3)`,
      [userId, plan_type, expiresAt.toISOString()]
    );

    await client.query('COMMIT');

    res.redirect(`/users/${userId}`);
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') { // unique violation
      return res.render('users/new', {
        error: 'Ya existe un usuario con ese Telegram ID'
      });
    }

    console.error('Create user error:', err.message);
    res.render('users/new', { error: 'Error creando el usuario' });
  } finally {
    client.release();
  }
});

// PUT /users/:id — Update user
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, telegram_id } = req.body;

  try {
    await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, telegram_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [first_name, last_name || null, telegram_id, id]
    );

    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).render('error', { message: 'Error actualizando usuario' });
  }
});

// POST /users/:id/activate — Activate membership
router.post('/:id/activate', async (req, res) => {
  const { id } = req.params;
  const { plan_type, duration_months } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Expire/cancel any existing active membership
    await client.query(
      `UPDATE memberships SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [id]
    );

    // Calculate new expiration
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + parseInt(duration_months || 1));

    // Create new active membership
    await client.query(
      `INSERT INTO memberships (user_id, plan_type, status, starts_at, expires_at)
       VALUES ($1, $2, 'active', NOW(), $3)`,
      [id, plan_type || 'basic', expiresAt.toISOString()]
    );

    await client.query('COMMIT');
    res.redirect(`/users/${id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Activate error:', err.message);
    res.status(500).render('error', { message: 'Error activando membresia' });
  } finally {
    client.release();
  }
});

// POST /users/:id/pause — Pause membership
router.post('/:id/pause', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE memberships
       SET status = 'paused', paused_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [id]
    );
    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error('Pause error:', err.message);
    res.status(500).render('error', { message: 'Error pausando membresia' });
  }
});

// POST /users/:id/cancel — Cancel membership
router.post('/:id/cancel', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE memberships
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND status IN ('active', 'paused')`,
      [id]
    );
    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error('Cancel error:', err.message);
    res.status(500).render('error', { message: 'Error cancelando membresia' });
  }
});

module.exports = router;
```

#### Archivo: `src/routes/payments.js` — Registro de pagos

```javascript
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /payments — List payments
router.get('/', async (req, res) => {
  const { page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  try {
    const [paymentsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT pl.*, u.first_name, u.last_name, u.telegram_id,
                au.full_name AS registered_by_name
         FROM payment_logs pl
         JOIN users u ON pl.user_id = u.id
         LEFT JOIN admin_users au ON pl.registered_by = au.id
         ORDER BY pl.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) AS total FROM payment_logs')
    ]);

    const totalPayments = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalPayments / limit);

    // Get users for the payment form dropdown
    const usersResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.telegram_id, m.plan_type
       FROM users u
       LEFT JOIN memberships m ON u.id = m.user_id AND m.status = 'active'
       ORDER BY u.first_name ASC`
    );

    res.render('payments/list', {
      payments: paymentsResult.rows,
      users: usersResult.rows,
      pagination: {
        page: parseInt(page),
        totalPages,
        totalPayments
      }
    });
  } catch (err) {
    console.error('Payment list error:', err.message);
    res.status(500).render('error', { message: 'Error cargando pagos' });
  }
});

// POST /payments — Register payment
router.post('/', async (req, res) => {
  const { user_id, amount, payment_method, reference_note, payment_date } = req.body;
  const adminId = req.session.admin.id;

  if (!user_id || !amount || !payment_method) {
    return res.status(400).render('error', {
      message: 'Usuario, monto y metodo de pago son obligatorios'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the active membership for this user (if any)
    const membershipResult = await client.query(
      `SELECT id FROM memberships
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );
    const membershipId = membershipResult.rows.length > 0
      ? membershipResult.rows[0].id
      : null;

    // Insert payment log
    await client.query(
      `INSERT INTO payment_logs
         (user_id, membership_id, amount, payment_method, reference_note, registered_by, payment_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user_id,
        membershipId,
        parseFloat(amount),
        payment_method,
        reference_note || null,
        adminId,
        payment_date || new Date().toISOString().split('T')[0]
      ]
    );

    await client.query('COMMIT');
    res.redirect('/payments');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register payment error:', err.message);
    res.status(500).render('error', { message: 'Error registrando pago' });
  } finally {
    client.release();
  }
});

module.exports = router;
```

---

## 4. Sistema de Autenticacion

### Flujo de autenticacion

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|  GET /login      |---->|  Render form     |---->|  Usuario llena   |
|                  |     |  login.ejs       |     |  email + pass    |
+------------------+     +------------------+     +--------+---------+
                                                           |
                                                           v
+------------------+     +------------------+     +--------+---------+
|                  |     |                  |     |                  |
|  Redirect /      |<----|  Crear sesion    |<----|  POST /login     |
|  (dashboard)     |     |  req.session     |     |  bcrypt.compare  |
+------------------+     +------------------+     +------------------+
                                                           |
                                                  (si falla)
                                                           v
                                                  +------------------+
                                                  |  Render login    |
                                                  |  con mensaje     |
                                                  |  de error        |
                                                  +------------------+
```

### Almacenamiento de sesiones

**Fase 1 (MVP)**: Sesiones en memoria con `express-session`. Es suficiente para 1-2 admins. Si el servidor se reinicia, los admins simplemente vuelven a hacer login.

**Fase 2 (Produccion estable)**: Migrar a Redis con `connect-redis`:

```javascript
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});
redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000
  }
}));
```

### Middleware de proteccion

El middleware `requireAuth` se aplica a todas las rutas excepto `/login`, `/health` y archivos estaticos. Funciona verificando que `req.session.admin` exista:

```javascript
function requireAuth(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/login');
  }
  next();
}
```

Si la sesion no existe o expiro, el usuario es redirigido al formulario de login. No se usan JWT ni tokens de ningun tipo — es autenticacion clasica de sesion con cookie.

### Hashing de contrasenas

Las contrasenas se almacenan con bcrypt usando un salt rounds de 12:

```javascript
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;

// Al crear admin (seed script)
const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

// Al verificar login
const match = await bcrypt.compare(inputPassword, storedHash);
```

---

## 5. Integracion con PostgreSQL

### Conexion compartida

El panel admin utiliza la **misma base de datos** que el bot de Telegram (n8n). Ambos comparten `DATABASE_URL`:

```
DATABASE_URL=postgresql://fitai_user:password@postgres:5432/fitai_db
```

La conexion se maneja con la libreria `pg` directamente, sin ORM. Se eligio este enfoque porque:

1. **Sin overhead de ORM**: No se necesitan migraciones, modelos ni abstracciones. Las queries SQL son simples y directas.
2. **Mismo SQL que n8n**: Los nodos PostgreSQL de n8n ejecutan SQL crudo. Mantener el mismo patron facilita la consistencia.
3. **Pool limitado**: Maximo 5 conexiones para no competir con n8n por los slots de PostgreSQL.

### Configuracion del Pool

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                       // Max 5 connections (n8n uses its own pool)
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if DB is unreachable
});
```

### Tablas que utiliza el panel admin

| Tabla | Operaciones | Descripcion |
|-------|-------------|-------------|
| `users` | SELECT, INSERT, UPDATE | Gestion de usuarios del bot |
| `memberships` | SELECT, INSERT, UPDATE | Activar, pausar, cancelar, renovar membresias |
| `payment_logs` | SELECT, INSERT | Registro y consulta de pagos |
| `user_profiles` | SELECT | Lectura del perfil de salud (solo lectura, el bot lo escribe) |
| `weight_logs` | SELECT | Lectura del historial de peso (solo lectura, el bot lo escribe) |
| `admin_users` | SELECT, UPDATE | Login y actualizacion de last_login_at |

### Patron de transacciones

Para operaciones que modifican multiples tablas (crear usuario + membresia, activar membresia + expirar la anterior), se usa el patron de transaccion explicita con `client`:

```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Multiple queries...
  await client.query('INSERT INTO users ...', [...]);
  await client.query('INSERT INTO memberships ...', [...]);

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

## 6. Como Activa/Desactiva el Acceso al Bot en Tiempo Real

### Mecanismo de sincronizacion

El panel admin y el bot de Telegram (n8n) no necesitan comunicarse directamente. Comparten la base de datos PostgreSQL y eso es suficiente:

```
+------------------+                     +------------------+
|                  |   UPDATE            |                  |
|  Panel Admin     |--------+           |  Bot (n8n)       |
|  (Express)       |        |           |  Webhook Handler |
|                  |        v           |                  |
+------------------+   +--------+      +------------------+
                       |        |             |
                       |  Post- |   SELECT    |
                       |  greSQL|<------------+
                       |        |  (cada mensaje)
                       +--------+
```

### Flujo detallado

1. **El admin cambia el status** de una membresia en el panel (ej: de `active` a `paused`):

```sql
-- Ejecutado por el panel admin
UPDATE memberships
SET status = 'paused', paused_at = NOW(), updated_at = NOW()
WHERE user_id = 42 AND status = 'active';
```

2. **El usuario envia un mensaje** en Telegram.

3. **El Webhook Handler de n8n** ejecuta la query de verificacion de membresia **en cada mensaje entrante**:

```sql
-- Ejecutado por n8n en cada mensaje
SELECT u.id, u.telegram_id, u.first_name,
       m.plan_type, m.status, m.expires_at
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
  AND m.status = 'active'
  AND m.expires_at > NOW()
WHERE u.telegram_id = $1
ORDER BY m.expires_at DESC
LIMIT 1;
```

4. **Como la membresia ya no tiene `status = 'active'`**, el LEFT JOIN no encuentra match. El campo `m.status` es `NULL` en el resultado.

5. **n8n detecta que no hay membresia activa** y envia el mensaje de rechazo al usuario:

```
Tu membresia esta pausada. Contacta al administrador para reactivarla.
```

### Por que funciona sin webhooks ni eventos

- La verificacion ocurre en **cada mensaje**, no con un sistema de cache
- PostgreSQL garantiza que el UPDATE del admin es visible inmediatamente para la siguiente lectura de n8n (consistencia de lectura por defecto)
- No hay cache intermedio de membresias — cada mensaje genera una query fresca
- El "costo" de esta query es despreciable (~1ms) gracias a los indices en `memberships(user_id, status, expires_at)`

### Latencia del cambio

| Accion del admin | Efecto en el bot |
|------------------|------------------|
| Pausar membresia | Siguiente mensaje del usuario es rechazado |
| Cancelar membresia | Siguiente mensaje del usuario es rechazado |
| Activar membresia | Siguiente mensaje del usuario es procesado |
| Cambiar plan | Siguiente mensaje usa el nuevo plan (si aplica) |

**No hay delay**. El cambio es efectivo en el momento exacto en que el usuario envia su siguiente mensaje despues del UPDATE.

---

## 7. Guia de Instalacion y Configuracion

### Prerrequisitos

- Node.js 18+ (LTS)
- PostgreSQL 16 con el schema del proyecto ya creado (ver `docs/data-models.md`)
- npm o yarn

### Paso 1: Instalar dependencias

```bash
cd admin-panel/
npm install
```

El `package.json` contiene:

```json
{
  "name": "fitai-admin-panel",
  "version": "1.0.0",
  "description": "Admin panel for FitAI Assistant",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js",
    "seed:admin": "node scripts/seed-admin.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "ejs": "^3.1.10",
    "express": "^4.21.0",
    "express-session": "^1.18.0",
    "pg": "^8.13.0"
  }
}
```

### Paso 2: Configurar variables de entorno

Crear archivo `.env` en la raiz de `admin-panel/`:

```bash
# PostgreSQL (misma URL que usa n8n)
DATABASE_URL=postgresql://fitai_user:your_password@localhost:5432/fitai_db

# Session
SESSION_SECRET=genera-una-cadena-aleatoria-de-al-menos-32-caracteres

# Server
ADMIN_PORT=3000
NODE_ENV=development
```

Para generar un `SESSION_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Paso 3: Crear el primer usuario administrador

Ejecutar el script de seed para crear el primer admin. Este script solicita email, nombre y contrasena por linea de comandos:

#### Archivo: `scripts/seed-admin.js`

```javascript
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('=== FitAI Admin — Crear usuario administrador ===\n');

  const email = await ask('Email: ');
  const fullName = await ask('Nombre completo: ');
  const password = await ask('Contrasena (min 8 caracteres): ');

  if (!email || !fullName || password.length < 8) {
    console.error('Error: Todos los campos son obligatorios. La contrasena debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName]
    );

    const admin = result.rows[0];
    console.log(`\nAdmin creado exitosamente:`);
    console.log(`  ID:     ${admin.id}`);
    console.log(`  Email:  ${admin.email}`);
    console.log(`  Nombre: ${admin.full_name}`);
  } catch (err) {
    if (err.code === '23505') {
      console.error(`Error: Ya existe un admin con el email "${email}".`);
    } else {
      console.error('Error creando admin:', err.message);
    }
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
```

Ejecutar:

```bash
npm run seed:admin
```

Ejemplo de uso:

```
=== FitAI Admin — Crear usuario administrador ===

Email: admin@fitai.com
Nombre completo: Mauro Ibarra
Contrasena (min 8 caracteres): ********

Admin creado exitosamente:
  ID:     1
  Email:  admin@fitai.com
  Nombre: Mauro Ibarra
```

### Paso 4: Iniciar el servidor

```bash
# Desarrollo (con hot reload)
npm run dev

# Produccion
npm start
```

El panel estara disponible en `http://localhost:3000`.

### Estructura de archivos

```
admin-panel/
├── .env
├── package.json
├── scripts/
│   └── seed-admin.js
└── src/
    ├── app.js
    ├── db.js
    ├── middleware/
    │   └── auth.js
    ├── public/
    │   └── css/
    │       └── style.css
    ├── routes/
    │   ├── auth.js
    │   ├── dashboard.js
    │   ├── payments.js
    │   └── users.js
    └── views/
        ├── layout.ejs
        ├── login.ejs
        ├── error.ejs
        ├── dashboard.ejs
        ├── users/
        │   ├── list.ejs
        │   ├── detail.ejs
        │   └── new.ejs
        └── payments/
            └── list.ejs
```

---

## 8. Proteccion en Produccion

### Nginx como reverse proxy

El panel admin **nunca se expone directamente a internet**. Nginx enruta el trafico bajo la ruta `/admin/`:

```nginx
# /etc/nginx/sites-available/fitai
server {
    listen 80;
    server_name fitai.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fitai.example.com;

    ssl_certificate /etc/letsencrypt/live/fitai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fitai.example.com/privkey.pem;

    # Webhook de Telegram (n8n)
    location /webhook/ {
        proxy_pass http://n8n:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Panel admin
    location /admin/ {
        proxy_pass http://admin-panel:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rate limiting: max 10 requests per second per IP
        limit_req zone=admin burst=20 nodelay;
    }

    # n8n UI (solo desarrollo, desactivar en produccion)
    location /n8n/ {
        proxy_pass http://n8n:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Rate limit zone definition (in http block)
# limit_req_zone $binary_remote_addr zone=admin:10m rate=10r/s;
```

### HTTPS con certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d fitai.example.com
```

Certbot configura automaticamente los certificados SSL y la renovacion automatica via cron.

### Cookie de sesion segura

En produccion (`NODE_ENV=production`), la cookie de sesion se configura con flags de seguridad:

```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,       // Solo enviar cookie por HTTPS
    httpOnly: true,     // No accesible desde JavaScript del navegador
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
    sameSite: 'lax'     // Proteccion contra CSRF
  }
}));
```

Flags explicados:

| Flag | Proposito |
|------|-----------|
| `secure: true` | La cookie solo se transmite por HTTPS. Previene intercepcion en texto plano. |
| `httpOnly: true` | JavaScript del lado del cliente no puede leer la cookie. Mitiga XSS. |
| `sameSite: 'lax'` | La cookie no se envia en requests cross-site (excepto navegacion). Mitiga CSRF. |
| `maxAge: 8h` | La sesion expira automaticamente despues de 8 horas de inactividad. |

### Rate limiting

Se aplica rate limiting a nivel de nginx (10 requests/segundo por IP) y opcionalmente a nivel de Express para el endpoint de login:

```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // Max 5 login attempts per window
  message: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  // ... login logic
});
```

### Checklist de seguridad para produccion

- [x] `SESSION_SECRET` generado con `crypto.randomBytes(32)`
- [x] `NODE_ENV=production` para activar cookie segura
- [x] HTTPS via certbot con renovacion automatica
- [x] Panel accesible solo bajo `/admin/` (no en puerto expuesto)
- [x] Rate limiting en nginx y en endpoint de login
- [x] Contrasenas hasheadas con bcrypt (salt rounds 12)
- [x] Cookie `httpOnly` + `secure` + `sameSite`
- [x] Pool de PostgreSQL limitado a 5 conexiones
- [x] Health check en `/health` sin autenticacion (para Docker healthcheck)
- [x] Manejo de errores que no expone stack traces al usuario
