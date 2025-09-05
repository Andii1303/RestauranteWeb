import 'dotenv/config';
import express from 'express';
import { ping, pool } from './db.js';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: FRONT_ORIGIN }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/db/ping', async (req, res) => {
  try {
    const result = await ping();
    res.json({ db: 'ok', result });
  } catch (err) {
    res.status(500).json({ db: 'error', message: err.message });
  }
});

// Example route to list tables
app.get('/db/tables', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
