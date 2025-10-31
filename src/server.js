/**
 * Backend HTTP server (Express)
 *
 * Qué hace este archivo (resumen):
 * - Configura middlewares globales (CORS, JSON, cookies).
 * - Verifica y prepara autenticación básica (tabla app_users y admin por defecto).
 * - Espera la disponibilidad de la base de datos antes de iniciar.
 * - Monta los routers de dominio (auth, reservas, usuarios, ingredientes, menú, facturas, mesas).
 * - Sirve los archivos estáticos del frontend desde /public.
 * - Arranca el servidor HTTP en el puerto/host configurados.
 *
 * Estructura de secciones:
 * 1) Imports y utilidades de ruta (__dirname)
 * 2) Inicialización de app y middlewares
 * 3) Setup de autenticación (ensureAuthSetup)
 * 4) Espera activa de DB (waitForDatabase)
 * 5) Rutas y routers (REST APIs)
 * 6) Servir frontend estático
 * 7) Bootstrap de arranque (main)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ping, pool, ensureReservationSchema } from './db.js';
import authRouter from './routes/auth.routes.js';

import reservasRouter from './routes/reservas.routes.js';
import usersRouter from './routes/users.routes.js';
import ingredientsRouter from './routes/ingredients.routes.js';
import menuRouter from './routes/menu.routes.js';
import facturasRouter from './routes/facturas.routes.js';
import mesasRouter from './routes/mesas.routes.js';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App instance
const app = express();

// CORS: allow explicit frontend origin if provided; otherwise reflect origin (true)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN : true;
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

app.use(express.json());
app.use(cookieParser());

// Inicializa tabla app_users y crea admin si no existe
async function ensureAuthSetup() {
  if (!pool) return; // if DB disabled
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
  if (!pool) return; // db disabled
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
// Rutas de ingredientes y menú
app.use(ingredientsRouter);
app.use(menuRouter);
app.use(facturasRouter);
app.use(mesasRouter);
console.log('Rutas de ingredientes y menú montadas');

// Alias específicos públicos (cliente no requiere login)
app.use('/client', express.static(path.join(__dirname, '../public/cliente')));

// Normalizador de rutas de login: cualquier variante termina en /login/login.html
app.use((req, res, next) => {
  if (/^\/login($|\/$|\.html$)/i.test(req.path)) {
    return res.redirect(302, '/login/login.html');
  }
  next();
});
app.use('/login', express.static(path.join(__dirname, '../public/login')));

// Helper: 404 si no autenticado o rol incorrecto (para secciones estáticas protegidas)
const notFoundPath = path.join(__dirname, '../public/404.html');
const guardStatic = (role) => (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(404).sendFile(notFoundPath, err => { if (err) res.status(404).end(); });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    if (!decoded || decoded.role !== role) {
      return res.status(404).sendFile(notFoundPath, err => { if (err) res.status(404).end(); });
    }
    req.user = decoded;
    return next();
  } catch {
    return res.status(404).sendFile(notFoundPath, err => { if (err) res.status(404).end(); });
  }
};

// No-cache para secciones protegidas (evitar back/forward muestren caché)
const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};
const staticNoStoreOpts = {
  etag: false,
  lastModified: false,
  cacheControl: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
};

// Secciones protegidas: ADMIN, COCINERO, MESERO, (repartidor asumido MESERO)
app.use('/admin', guardStatic('ADMIN'), noStore, express.static(path.join(__dirname, '../public/admin'), staticNoStoreOpts));
app.use('/kitchen', guardStatic('COCINERO'), noStore, express.static(path.join(__dirname, '../public/kitchen'), staticNoStoreOpts));
app.use('/waiter', guardStatic('MESERO'), noStore, express.static(path.join(__dirname, '../public/waiter'), staticNoStoreOpts));
app.use('/delivey', guardStatic('MESERO'), noStore, express.static(path.join(__dirname, '../public/delivey'), staticNoStoreOpts));

// Favicon explícito (si existe public/favicon.ico)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/favicon.ico'), err => {
    if (err) res.status(204).end(); // silencioso si no existe
  });
});

// Servir carpeta public para el resto (después de proteger secciones)
app.use(express.static(path.join(__dirname, '../public')));

// Redirección raíz directamente a menú cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/cliente/menu.html'));
});

// Alias directo explícito (en caso de acceso antes del normalizador)
app.get('/login.html', (req, res) => {
  res.redirect(302, '/login/login.html');
});

// Alias para la nueva sección de reservas en /public/reserve/reserve.html
app.get('/reserve', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reserve/reserve.html'));
});

// Health endpoint for Render/monitoring
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

// Describir columnas de una tabla (debug)
app.get('/db/describe', async (req, res) => {
  try {
    const table = String(req.query?.table || '').trim();
    if (!table) return res.status(400).json({ error: 'table requerido' });
    const [rows] = await pool.query(`DESCRIBE \`${table}\``);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: listar rutas registradas (no exponer en prod)
app.get('/debug/routes', (req, res) => {
  const routes = [];
  app._router?.stack?.forEach((m) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods).filter(Boolean);
      routes.push({ path: m.route.path, methods });
    } else if (m.name === 'router' && m.handle?.stack) {
      m.handle.stack.forEach((h) => {
        const route = h.route;
        if (route?.path) {
          const methods = Object.keys(route.methods).filter(Boolean);
          routes.push({ path: route.path, methods });
        }
      });
    }
  });
  res.json(routes);
});

// Montar rutas de reservas (si existen)
app.use(reservasRouter);

// 404 final
app.use((req, res) => {
  const notFound = path.join(__dirname, '../public/404.html');
  return res.status(404).sendFile(notFound, err => {
    if (err) res.status(404).json({ error: 'Recurso no encontrado' });
  });
});

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

// Inicializar todo y arrancar servidor con espera de DB, salvo SKIP_DB=true
try {
  if (process.env.SKIP_DB === 'true') {
    console.warn('Starting without DB (SKIP_DB=true). Only /health and static content will work.');
  } else {
    await waitForDatabase();
    // Asegurar esquema mínimo para mesas/reservas/facturas
    await ensureReservationSchema();
    await ensureAuthSetup();
  }
  app.listen(PORT, HOST, () => {
    console.log(`Backend listening on http://${HOST}:${PORT}`);
  });
} catch (err) {
  console.error('Fallo crítico al iniciar backend:', err.message);
  process.exit(1);
}