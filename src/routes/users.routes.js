/**
 * Usuarios (rutas)
 *
 * Ejemplos de endpoints (dependiendo de implementación actual):
 * - GET    /api/users           -> listar usuarios
 * - POST   /api/users           -> crear usuario
 * - PUT    /api/users/:id       -> actualizar usuario
 * - DELETE /api/users/:id       -> desactivar/eliminar usuario
 *
 * Notas:
 * - Requiere middleware de autenticación/roles en `src/middleware/auth.js`.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

// Roles soportados (coinciden con ENUM app_users.role)
const ROLES = ['ADMIN','COCINERO','MESERO','CLIENTE'];

const router = Router();

// Listar roles disponibles
router.get('/roles', verifyToken, requireRole('ADMIN'), (req, res) => {
  res.json(ROLES);
});

// Crear usuario nuevo
router.post('/users', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email y password son obligatorios' });
    }
    const chosenRole = role && ROLES.includes(role) ? role : 'CLIENTE';

    // Verificar existencia
    const [exists] = await pool.query('SELECT id FROM app_users WHERE email = ? LIMIT 1', [email]);
    if (exists.length) {
      return res.status(409).json({ error: 'Email ya registrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO app_users (name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)',
      [name, email, hash, chosenRole]
    );

    res.status(201).json({ message: 'Usuario creado', user: { name, email, role: chosenRole } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando usuario', detail: err.message });
  }
});

export default router;
