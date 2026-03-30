const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [
      totalUsersResult,
      activeMembershipsResult,
      expiringResult,
      revenueResult,
      expiringListResult,
      recentPaymentsResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM users'),
      pool.query(
        `SELECT COUNT(*) AS count FROM memberships
         WHERE status = 'active' AND expires_at > NOW()`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM memberships
         WHERE status = 'active'
           AND expires_at > NOW()
           AND expires_at <= NOW() + INTERVAL '7 days'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_logs
         WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)
           AND payment_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`
      ),
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
