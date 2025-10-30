// Este archivo solo reexporta el servidor real para evitar duplicidad de lógica.
// Mantenerlo garantiza compatibilidad con configuraciones antiguas que todavía
// ejecuten `node src/index.js` (por ejemplo, en Render si quedó el Start Command).
import './server.js';