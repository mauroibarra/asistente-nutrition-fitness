require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// .env.local overrides for local dev (gitignored, not present in production)
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local'), override: true });

const express = require('express');
const session = require('express-session');
const path = require('path');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');
const prospectRoutes = require('./routes/prospects');

const app = express();
const PORT = process.env.ADMIN_PANEL_PORT || process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.ADMIN_PANEL_SECRET_KEY || process.env.SESSION_SECRET || 'fitai-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// Make session admin available in all templates
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
app.use('/prospects', requireAuth, prospectRoutes);

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
  console.log(`FitAI Admin Panel running on port ${PORT}`);
});

module.exports = app;
