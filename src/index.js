import 'dotenv/config'; // carga variables de entorno
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { ping, pool } from './db.js';
import authRouter from './routes/auth.routes.js';
import { verifyToken, requireRole } from './middleware/auth.js';
// Importa rutas de reservas (HEAD)
import reservasRouter from './routes/reservas.routes.js';
import usersRouter from './routes/users.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();


// CORS con credenciales para cookies JWT
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

// Espera activa a que la base de datos responda antes de continuar (retry/backoff simple)
async function waitForDatabase({ attempts = 12, delayMs = 2500 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const [r] = await pool.query('SELECT 1 AS ok');
      if (r && r[0]) {
        console.log(`DB disponible (intento ${i}/${attempts})`);
        return;
      }
    } catch (err) {
      console.warn(`DB no disponible aún (intento ${i}/${attempts}): ${err.code || err.message}`);
    }
    if (i < attempts) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw new Error(`No se pudo conectar a la base de datos después de ${attempts} intentos.`);
}

// Rutas API (auth)
app.use(authRouter);
// Rutas de administración de usuarios
app.use(usersRouter);

// ================== SERVIDORES DE ESTÁTICOS ==================
// Servir toda la carpeta public primero (para favicon, assets compartidos, etc.)
app.use(express.static(path.join(__dirname, '../public')));
// Alias específicos
app.use('/client', express.static(path.join(__dirname, '../public/cliente')));

// Normalizador de rutas de login: cualquier variante termina en /login/login.html
app.use((req, res, next) => {
  if (/^\/login($|\/$|\.html$)/i.test(req.path)) {
    return res.redirect(302, '/login/login.html');
  }
  next();
});
app.use('/login', express.static(path.join(__dirname, '../public/login')));
app.use('/admin', verifyToken, requireRole('ADMIN'), express.static(path.join(__dirname, '../public/admin')));

// Favicon explícito (si existe public/favicon.ico)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/favicon.ico'), err => {
    if (err) res.status(204).end(); // silencioso si no existe
  });
});

// Redirección raíz directamente a menú cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/cliente/menu.html'));
});

// Alias directo explícito (en caso de acceso antes del normalizador)
app.get('/login.html', (req, res) => {
  res.redirect(302, '/login/login.html');
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

// Listar tablas
app.get('/db/tables', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Montar rutas de reservas (si existen)
app.use(reservasRouter);

// ================== 404 FINAL ==================
app.use((req, res) => {
  const notFound = path.join(__dirname, '../public/404.html');
  return res.status(404).sendFile(notFound, err => {
    if (err) res.status(404).json({ error: 'Recurso no encontrado' });
  });
});

const PORT = process.env.PORT || 4000;

// Inicializar todo y arrancar servidor con espera de DB
try {
  await waitForDatabase();
  await ensureAuthSetup();
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
} catch (err) {
  console.error('Fallo crítico al iniciar backend:', err.message);
  process.exit(1);
}