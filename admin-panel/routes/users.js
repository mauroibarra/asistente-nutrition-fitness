const express = require('express');
const crypto = require('crypto');
const { pool } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  const { status, plan, search, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  const showingInactive = status === 'inactive';

  let query = `
    SELECT u.id, u.first_name, u.last_name, u.telegram_id, u.is_active,
           m.plan_type, m.status, m.expires_at
    FROM users u
    LEFT JOIN memberships m ON u.id = m.user_id
      AND m.id = (
        SELECT id FROM memberships
        WHERE user_id = u.id
        ORDER BY created_at DESC LIMIT 1
      )
    WHERE EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.user_id = u.id
    )
    AND u.is_active = ${showingInactive ? 'false' : 'true'}
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
    WHERE EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.user_id = u.id
    )
    AND u.is_active = ${showingInactive ? 'false' : 'true'}
  `;

  const params = [];
  const countParams = [];
  let paramIndex = 1;

  if (status && status !== 'all' && !showingInactive) {
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
      pagination: { page: parseInt(page), totalPages, totalUsers },
      query: req.query
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
      weights: weightsResult.rows,
      query: req.query
    });
  } catch (err) {
    console.error('User detail error:', err.message);
    res.status(500).render('error', { message: 'Error cargando detalle del usuario' });
  }
});

router.post('/', async (req, res) => {
  const { telegram_id, first_name, last_name, plan_type, duration_months,
          document_number, country, city, phone_number } = req.body;

  if (!telegram_id || !first_name || !plan_type || !duration_months) {
    return res.render('users/new', {
      error: 'Telegram ID, nombre, plan y duracion son obligatorios'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (telegram_id, first_name, last_name, document_number, country, city, phone_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        parseInt(telegram_id),
        first_name.trim(),
        last_name ? last_name.trim() : null,
        document_number ? document_number.trim() : null,
        country ? country.trim() : null,
        city ? city.trim() : null,
        phone_number ? phone_number.trim() : null
      ]
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

// GET /users/:id/edit — Edit form
router.get('/:id/edit', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).render('error', { message: 'Usuario no encontrado' });
    }
    res.render('users/edit', { user: result.rows[0], error: null, query: req.query });
  } catch (err) {
    console.error('Edit form error:', err.message);
    res.status(500).render('error', { message: 'Error cargando formulario de edicion' });
  }
});

// POST /users/:id/update — Save changes
router.post('/:id/update', async (req, res) => {
  const { id } = req.params;
  const {
    first_name, last_name, telegram_id,
    document_number, country, city, phone_number
  } = req.body;

  if (!first_name || !telegram_id) {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.render('users/edit', {
      user: userResult.rows[0],
      error: 'Nombre y Telegram ID son obligatorios'
    });
  }

  try {
    await pool.query(
      `UPDATE users
       SET first_name      = $1,
           last_name       = $2,
           telegram_id     = $3,
           document_number = $4,
           country         = $5,
           city            = $6,
           phone_number    = $7,
           updated_at      = NOW()
       WHERE id = $8`,
      [
        first_name.trim(),
        last_name ? last_name.trim() : null,
        parseInt(telegram_id),
        document_number ? document_number.trim() : null,
        country ? country.trim() : null,
        city ? city.trim() : null,
        phone_number ? phone_number.trim() : null,
        id
      ]
    );
    res.redirect(`/users/${id}`);
  } catch (err) {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const msg = err.code === '23505'
      ? 'Ya existe un usuario con ese Telegram ID'
      : 'Error actualizando el usuario';
    console.error('Update user error:', err.message);
    res.render('users/edit', { user: userResult.rows[0], error: msg });
  }
});

// POST /users/:id/deactivate — Soft delete: disables bot access, preserves all data
router.post('/:id/deactivate', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]
    );
    await client.query(
      `UPDATE memberships SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND status IN ('active', 'paused')`,
      [id]
    );
    await client.query('COMMIT');
    res.redirect(`/users/${id}?deactivated=1`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Deactivate error:', err.message);
    res.status(500).render('error', { message: 'Error desactivando el usuario' });
  } finally {
    client.release();
  }
});

// POST /users/:id/reactivate — Restore a deactivated user (no membership re-enabled automatically)
router.post('/:id/reactivate', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1`, [id]
    );
    res.redirect(`/users/${id}?reactivated=1`);
  } catch (err) {
    console.error('Reactivate error:', err.message);
    res.status(500).render('error', { message: 'Error reactivando el usuario' });
  }
});

// POST /users/:id/delete — Hard delete: removes all data from DB and Qdrant
router.post('/:id/delete', async (req, res) => {
  const { id } = req.params;
  const { confirm_name } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1', [id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];
    const expected = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`.trim();

    if (confirm_name !== expected) {
      return res.redirect(`/users/${id}/edit?delete_error=nombre_incorrecto`);
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // Best-effort Qdrant cleanup — does not block deletion if Qdrant is unreachable
    try {
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      await fetch(`${qdrantUrl}/collections/user_rag/points/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { must: [{ key: 'user_id', match: { value: parseInt(id) } }] } })
      });
    } catch (qdrantErr) {
      console.warn(`Qdrant cleanup skipped for user ${id}:`, qdrantErr.message);
    }

    res.redirect('/users?deleted=1');
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).render('error', { message: 'Error eliminando el usuario' });
  }
});

// POST /users/:id/generate-migration-token
router.post('/:id/generate-migration-token', async (req, res) => {
  const { id } = req.params;

  try {
    const token = 'FIT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      `UPDATE users
       SET migration_token = $1, migration_token_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [token, expiresAt.toISOString(), id]
    );

    res.redirect(`/users/${id}?token_generated=1`);
  } catch (err) {
    console.error('Generate migration token error:', err.message);
    res.status(500).render('error', { message: 'Error generando el codigo de migracion' });
  }
});

// POST /users/:id/revoke-migration-token
router.post('/:id/revoke-migration-token', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE users
       SET migration_token = NULL, migration_token_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    res.redirect(`/users/${id}`);
  } catch (err) {
    console.error('Revoke migration token error:', err.message);
    res.status(500).render('error', { message: 'Error revocando el codigo' });
  }
});

// POST /users/:id/merge — Merge a prospect (new telegram_id) into this user
router.post('/:id/merge', async (req, res) => {
  const { id } = req.params;
  const { prospect_user_id } = req.body;

  if (!prospect_user_id) {
    return res.status(400).render('error', { message: 'prospect_user_id es requerido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the prospect's telegram_id
    const prospectResult = await client.query(
      'SELECT telegram_id, first_name FROM users WHERE id = $1', [prospect_user_id]
    );
    if (prospectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).render('error', { message: 'Prospecto no encontrado' });
    }

    const newTelegramId = prospectResult.rows[0].telegram_id;

    // Update main user with new telegram_id + clear migration token
    await client.query(
      `UPDATE users
       SET telegram_id = $1, migration_token = NULL, migration_token_expires_at = NULL, updated_at = NOW()
       WHERE id = $2`,
      [newTelegramId, id]
    );

    // Delete the prospect (empty) user record
    await client.query('DELETE FROM users WHERE id = $1', [prospect_user_id]);

    await client.query('COMMIT');
    res.redirect(`/users/${id}?merged=1`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Merge error:', err.message);
    res.status(500).render('error', { message: 'Error fusionando cuentas' });
  } finally {
    client.release();
  }
});

module.exports = router;
