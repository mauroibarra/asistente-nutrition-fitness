# Panel de Administración — FitAI Assistant

## Tecnología

Express.js + EJS + express-session + bcrypt + pg

Elegido por: mínimas dependencias, mismo stack Node.js que n8n, Docker image de ~80MB, control total de la UI.

---

## Instalación Rápida

### Con Docker (recomendado)

El panel admin se levanta automáticamente con el stack completo:

```bash
docker compose up -d admin-panel
```

### Desarrollo Local (sin Docker)

```bash
cd admin-panel
npm install
cp ../.env.example ../.env  # Configurar DATABASE_URL y ADMIN_PANEL_SECRET_KEY
npm run dev
```

---

## Variables de Entorno Requeridas

| Variable | Descripción |
|----------|------------|
| `DATABASE_URL` | URL de conexión a PostgreSQL |
| `ADMIN_PANEL_SECRET_KEY` | Secret para cookies de sesión (generar con `openssl rand -hex 32`) |
| `ADMIN_PANEL_PORT` | Puerto del panel (default: 3000) |
| `NODE_ENV` | `development` o `production` |

---

## Crear el Primer Usuario Administrador

El primer admin se crea via un script CLI (no hay formulario de auto-registro por seguridad):

```bash
# Con Docker
docker compose exec admin-panel node scripts/create-admin.js \
  --email admin@fitai.com \
  --password "contraseña-segura" \
  --name "Admin Principal"

# Sin Docker (en desarrollo local)
cd admin-panel
node scripts/create-admin.js \
  --email admin@fitai.com \
  --password "contraseña-segura" \
  --name "Admin Principal"
```

El script:
1. Verifica que la tabla `admin_users` existe
2. Hashea la contraseña con bcrypt (12 rounds)
3. Inserta el registro en `admin_users`
4. Confirma la creación

---

## Acceso

- **Desarrollo**: `http://localhost:3000`
- **Producción**: `https://tudominio.com/admin/` (detrás de nginx)

### Credenciales por Defecto

No existen credenciales por defecto. Debes crear el primer admin con el script anterior.

---

## Estructura del Proyecto

```
admin-panel/
├── Dockerfile              # Docker image (node:20-alpine)
├── package.json            # Dependencias
├── app.js                  # Punto de entrada Express
├── config/
│   └── database.js         # Pool de conexión PostgreSQL
├── middleware/
│   ├── auth.js             # Verificación de sesión
│   └── errorHandler.js     # Manejo global de errores
├── routes/
│   ├── auth.js             # Login / Logout
│   ├── dashboard.js        # Dashboard principal
│   ├── users.js            # CRUD de usuarios
│   └── payments.js         # Registro de pagos
├── views/
│   ├── layout.ejs          # Layout base
│   ├── login.ejs           # Página de login
│   ├── dashboard.ejs       # Dashboard con métricas
│   ├── users/
│   │   ├── index.ejs       # Lista de usuarios
│   │   ├── show.ejs        # Detalle de usuario
│   │   └── new.ejs         # Formulario de alta
│   └── payments/
│       └── new.ejs         # Formulario de pago
├── public/
│   └── css/
│       └── style.css       # Estilos mínimos
└── scripts/
    └── create-admin.js     # Script CLI para crear admin
```

---

## Seguridad en Producción

1. El panel corre detrás de nginx en la ruta `/admin/`
2. HTTPS obligatorio via Let's Encrypt
3. Cookie de sesión con flags `secure`, `httpOnly`, `sameSite: 'strict'`
4. Rate limiting via nginx (`limit_req zone=admin_limit`)
5. No hay rutas públicas excepto `/login` y `/health`

---

## Documentación Completa

Consulta `docs/admin-panel.md` para la documentación detallada incluyendo:
- Wireframes de todas las pantallas
- Descripción de todos los endpoints
- Sistema de autenticación
- Ejemplos de código
- Integración con PostgreSQL
