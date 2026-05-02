const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, 'wheels.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS wheel_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wheel TEXT NOT NULL CHECK(wheel IN ('fun', 'meals')),
    label TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed some default items if the table is empty
const count = db.prepare('SELECT COUNT(*) as cnt FROM wheel_items').get();
if (count.cnt === 0) {
  const insert = db.prepare('INSERT INTO wheel_items (wheel, label) VALUES (?, ?)');
  const seedFun = db.transaction(() => {
    ['Hiking', 'Movie Night', 'Board Games', 'Bike Ride', 'Bowling', 'Mini Golf'].forEach(
      (label) => insert.run('fun', label)
    );
    ['Pizza', 'Tacos', 'Sushi', 'Burgers', 'Pasta', 'Stir Fry'].forEach(
      (label) => insert.run('meals', label)
    );
  });
  seedFun();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting — protect API endpoints from abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // max 200 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// --- API Routes ---

// GET all items for a wheel
app.get('/api/wheels/:wheel', (req, res) => {
  const { wheel } = req.params;
  if (!['fun', 'meals'].includes(wheel)) {
    return res.status(400).json({ error: 'Invalid wheel. Use "fun" or "meals".' });
  }
  const items = db.prepare('SELECT id, label FROM wheel_items WHERE wheel = ? ORDER BY id').all(wheel);
  res.json(items);
});

// POST add a new item to a wheel
app.post('/api/wheels/:wheel', (req, res) => {
  const { wheel } = req.params;
  const { label } = req.body;
  if (!['fun', 'meals'].includes(wheel)) {
    return res.status(400).json({ error: 'Invalid wheel. Use "fun" or "meals".' });
  }
  if (!label || typeof label !== 'string' || label.trim() === '') {
    return res.status(400).json({ error: 'Label is required and must be a non-empty string.' });
  }
  const trimmed = label.trim();
  if (trimmed.length > 100) {
    return res.status(400).json({ error: 'Label must be 100 characters or fewer.' });
  }
  const result = db
    .prepare('INSERT INTO wheel_items (wheel, label) VALUES (?, ?)')
    .run(wheel, trimmed);
  res.status(201).json({ id: result.lastInsertRowid, label: trimmed });
});

// DELETE remove an item from a wheel
app.delete('/api/wheels/:wheel/:id', (req, res) => {
  const { wheel, id } = req.params;
  if (!['fun', 'meals'].includes(wheel)) {
    return res.status(400).json({ error: 'Invalid wheel. Use "fun" or "meals".' });
  }
  const item = db
    .prepare('SELECT id FROM wheel_items WHERE id = ? AND wheel = ?')
    .get(id, wheel);
  if (!item) {
    return res.status(404).json({ error: 'Item not found.' });
  }
  db.prepare('DELETE FROM wheel_items WHERE id = ?').run(id);
  res.status(204).send();
});

// Serve the single-page app for any unmatched routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start listening when run directly (not when required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tyler's Wheel server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
