import jwt from "jsonwebtoken";

const { JWT_SECRET = "dev_secret_change_me" } = process.env;

export function signToken(payload, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d", ...opts });
}

export function verifyToken(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ ok: false, message: "No autenticado" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Token inválido" });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(403).json({ ok: false, message: "Sin rol" });
    if (req.user.role !== role) return res.status(403).json({ ok: false, message: "Acceso denegado" });
    next();
  };
}