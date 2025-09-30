import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { signToken, verifyToken } from "../middleware/auth.js";

const router = Router();

// POST /auth/login { email, password }
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, message: "Email y contraseña son requeridos" });
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, password_hash, role, active FROM app_users WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ ok: false, message: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, message: "Credenciales inválidas" });

    const token = signToken({ uid: user.id, email: user.email, role: user.role });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: false, maxAge: 86400000 });
    return res.json({ ok: true, data: { name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
});

router.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/auth/me", verifyToken, (req, res) => {
  res.json({ ok: true, data: req.user });
});

export default router;