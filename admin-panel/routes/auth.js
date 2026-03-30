const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { error: 'Email y contrasena son requeridos' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, is_active FROM admin_users WHERE email = $1',
      [email.toLowerCase().trim()]
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

    await pool.query(
      'UPDATE admin_users SET last_login_at = NOW() WHERE id = $1',
      [admin.id]
    );

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

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err.message);
    res.redirect('/login');
  });
});

module.exports = router;
