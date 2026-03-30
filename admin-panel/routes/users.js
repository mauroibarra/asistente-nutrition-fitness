const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

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

    res.render('users/index', {
      users: usersResult.rows,
      filters: { status: status || 'all', plan: plan || 'all', search: search || '' },
      pagination: { page: parseInt(page), totalPages, totalUsers }
    });
  } catch (err) {
    console.error('User list error:', err.message);
    res.status(500).render('error', { message: 'Error cargando usuarios' });
  }
});

router.get('/new', (req, res) => {
  res.render('users/new', { error: null });
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [userResult, membershipResult, profileResult, paymentsResult, weightsResult] =
      await Promise.all([
        pool.query('SELECT * FROM users WHERE id = $1', [id]),
        pool.query(
          'SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [id]
        ),
        pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [id]),
        pool.query(
          `SELECT pl.*, au.full_name AS registered_by_name
           FROM payment_logs pl
           LEFT JOIN admin_users au ON pl.registered_by = au.id
           WHERE pl.user_id = $1
           ORDER BY pl.payment_date DESC`,
          [id]
        ),
        pool.query(
          `SELECT weight_kg, body_fat_pct, logged_at
           FROM weight_logs
           WHERE user_id = $1
           ORDER BY logged_at ASC
           LIMIT 12`,
          [id]
        )
      ]);

    if (userResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Usuario no encontrado' });
    }

    res.render('users/show', {
      user: userResult.rows[0],
      membership: membershipResult.rows[0] || null,
      profile: profileResult.rows[0] || null,
      payments: paymentsResult.rows,
      weights: weightsResult.rows
    });
  } catch (err) {
    console.error('User detail error:', err.message);
    res.status(500).render('error', { message: 'Error cargando detalle del usuario' });
  }
});

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

    const userResult = await client.query(
      `INSERT INTO users (telegram_id, first_name, last_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [parseInt(telegram_id), first_name.trim(), last_name ? last_name.trim() : null]
    );
    const userId = userResult.rows[0].id;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + parseInt(duration_months));

    await client.query(
      `INSERT INTO memberships (user_id, plan_type, status, starts_at, expires_at)
       VALUES ($1, $2, 'active', NOW(), $3)`,
      [userId, plan_type, expiresAt.toISOString()]
    );

    await client.query('COMMIT');
    res.redirect(`/users/${userId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.render('users/new', { error: 'Ya existe un usuario con ese Telegram ID' });
    }
    console.error('Create user error:', err.message);
    res.render('users/new', { error: 'Error creando el usuario' });
  } finally {
    client.release();
  }
});

router.post('/:id/activate', async (req, res) => {
  const { id } = req.params;
  const { plan_type, duration_months } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE memberships SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [id]
    );

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + parseInt(duration_months || 1));

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
