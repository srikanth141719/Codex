const fs = require('fs');
const path = require('path');

/**
 * Minimal SQL migration runner.
 * - Uses a `schema_migrations` table for tracking.
 * - Runs `backend/migrations/*.sql` in lexicographic order.
 */
async function runMigrations(pool) {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.log('ℹ No migrations directory found, skipping migrations');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await pool.query('SELECT id FROM schema_migrations');
  const appliedSet = new Set(applied.rows.map(r => r.id));

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');

    console.log(`→ Applying migration ${file}`);
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      console.log(`✓ Applied migration ${file}`);
    } catch (err) {
      console.error(`✗ Migration failed: ${file}`);
      throw err;
    }
  }
}

module.exports = { runMigrations };

