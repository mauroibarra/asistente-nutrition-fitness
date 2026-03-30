const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  const { page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;

  try {
    const [paymentsResult, countResult, usersResult] = await Promise.all([
      pool.query(
        `SELECT pl.id, pl.payment_date, pl.amount, pl.payment_method, pl.reference_note,
                u.first_name, u.last_name, u.telegram_id,
                au.full_name AS registered_by_name
         FROM payment_logs pl
         JOIN users u ON pl.user_id = u.id
         LEFT JOIN admin_users au ON pl.registered_by = au.id
         ORDER BY pl.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) AS total FROM payment_logs'),
      pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.telegram_id, m.plan_type
         FROM users u
         LEFT JOIN memberships m ON u.id = m.user_id
           AND m.id = (
             SELECT id FROM memberships WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
           )
         ORDER BY u.first_name ASC`
      )
    ]);

    const totalPayments = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalPayments / limit);

    res.render('payments/list', {
      payments: paymentsResult.rows,
      users: usersResult.rows,
      pagination: { page: parseInt(page), totalPages, totalPayments }
    });
  } catch (err) {
    console.error('Payment list error:', err.message);
    res.status(500).render('error', { message: 'Error cargando pagos' });
  }
});

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

    const membershipResult = await client.query(
      `SELECT id FROM memberships
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );
    const membershipId = membershipResult.rows.length > 0
      ? membershipResult.rows[0].id
      : null;

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
