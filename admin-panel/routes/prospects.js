const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// GET /prospects — Users with no active/trial membership (captured by Telegram bot)
router.get('/', async (req, res) => {
  const { search, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  let where = `
    WHERE NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = u.id
        AND m.status IN ('active', 'trial')
    )
  `;
  const params = [];
  const countParams = [];
  let paramIndex = 1;

  if (search) {
    const clause = ` AND (
      u.first_name ILIKE $${paramIndex}
      OR u.last_name ILIKE $${paramIndex}
      OR u.telegram_id::TEXT LIKE $${paramIndex}
      OR u.username ILIKE $${paramIndex}
    )`;
    where += clause;
    params.push(`%${search}%`);
    countParams.push(`%${search}%`);
    paramIndex++;
  }

  try {
    const [prospectsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name,
                u.language_code, u.created_at,
                (SELECT m.status FROM memberships m WHERE m.user_id = u.id ORDER BY m.created_at DESC LIMIT 1) AS last_membership_status
         FROM users u
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM users u ${where}`,
        countParams
      )
    ]);

    const totalProspects = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalProspects / limit);

    res.render('prospects/index', {
      prospects: prospectsResult.rows,
      filters: { search: search || '' },
      pagination: { page: parseInt(page), totalPages, totalProspects }
    });
  } catch (err) {
    console.error('Prospects list error:', err.message);
    res.status(500).render('error', { message: 'Error cargando prospectos' });
  }
});

// GET /prospects/:id — Prospect detail + convert form
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [userResult, membershipHistoryResult] = await Promise.all([
      pool.query('SELECT * FROM users WHERE id = $1', [id]),
      pool.query(
        'SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at DESC',
        [id]
      )
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Prospecto no encontrado' });
    }

    res.render('prospects/show', {
      prospect: userResult.rows[0],
      membershipHistory: membershipHistoryResult.rows,
      error: null
    });
  } catch (err) {
    console.error('Prospect detail error:', err.message);
    res.status(500).render('error', { message: 'Error cargando prospecto' });
  }
});

// POST /prospects/:id/convert — Convert prospect to member
router.post('/:id/convert', async (req, res) => {
  const { id } = req.params;
  const {
    first_name, last_name, plan_type, duration_months,
    document_number, country, city, phone_number
  } = req.body;

  if (!first_name || !plan_type || !duration_months) {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const membershipHistoryResult = await pool.query(
      'SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at DESC', [id]
    );
    return res.render('prospects/show', {
      prospect: userResult.rows[0],
      membershipHistory: membershipHistoryResult.rows,
      error: 'Nombre, plan y duracion son obligatorios'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update user with any additional data provided
    await client.query(
      `UPDATE users
       SET first_name = $1, last_name = $2,
           document_number = $3, country = $4, city = $5, phone_number = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [
        first_name.trim(),
        last_name ? last_name.trim() : null,
        document_number ? document_number.trim() : null,
        country ? country.trim() : null,
        city ? city.trim() : null,
        phone_number ? phone_number.trim() : null,
        id
      ]
    );

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + parseInt(duration_months));

    await client.query(
      `INSERT INTO memberships (user_id, plan_type, status, starts_at, expires_at)
       VALUES ($1, $2, 'active', NOW(), $3)`,
      [id, plan_type, expiresAt.toISOString()]
    );

    await client.query('COMMIT');
    res.redirect(`/users/${id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Convert prospect error:', err.message);
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const membershipHistoryResult = await pool.query(
      'SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at DESC', [id]
    );
    res.render('prospects/show', {
      prospect: userResult.rows[0],
      membershipHistory: membershipHistoryResult.rows,
      error: 'Error al convertir el prospecto: ' + err.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
