#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

const email = get('--email');
const password = get('--password');
const name = get('--name') || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js --email <email> --password <password> [--name <name>]');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createAdmin() {
  try {
    // Verify table exists
    const tableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'admin_users'
      ) AS exists`
    );
    if (!tableCheck.rows[0].exists) {
      console.error('Error: Table admin_users does not exist. Run the migration first.');
      process.exit(1);
    }

    // Check for duplicate
    const existing = await pool.query('SELECT id FROM admin_users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      console.error(`Error: Admin with email '${email}' already exists.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, full_name, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, email, full_name`,
      [email.toLowerCase(), passwordHash, name]
    );

    const admin = result.rows[0];
    console.log('Admin created successfully:');
    console.log(`  ID:    ${admin.id}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Name:  ${admin.full_name}`);
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAdmin();
