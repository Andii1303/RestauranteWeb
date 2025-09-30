import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { ping, pool } from './db.js';
import authRouter from './routes/auth.routes.js';
import { verifyToken, requireRole } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Inicializa tabla app_users y crea admin si no existe
async function ensureAuthSetup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('ADMIN','COCINERO','MESERO','CLIENTE') NOT NULL DEFAULT 'CLIENTE',
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@restaurante.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin123!';
  const adminName = process.env.ADMIN_NAME || 'Administrador';

  const [rows] = await pool.query("SELECT id FROM app_users WHERE email = ? LIMIT 1", [adminEmail]);
  if (!rows.length) {
    const hash = await bcrypt.hash(adminPass, 10);
    await pool.query(
      "INSERT INTO app_users (name, email, password_hash, role, active) VALUES (?, ?, ?, 'ADMIN', 1)",
      [adminName, adminEmail, hash]
    );
    console.log(`Admin creado: ${adminEmail}`);
  }
}

// Rutas API (auth)
app.use(authRouter);

// Estáticos por carpetas
app.use('/manager', verifyToken, requireRole('ADMIN'), express.static(path.join(__dirname, '../public/manager')));
app.use('/restaurante', express.static(path.join(__dirname, '../public/restaurante')));
app.use('/views', express.static(path.join(__dirname, '../public/views')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use(express.static(path.join(__dirname, '../public')));

// Página principal: interfaz cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/restaurante/index.html'));
});

// Página de login (usa tu vista actual)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/views/login.html'));
});

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

const PORT = process.env.PORT || 4000;

// Inicializar todo y arrancar servidor
await ensureAuthSetup();

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});