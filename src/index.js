/**
 * Punto de entrada de compatibilidad
 *
 * Algunas plataformas (p.ej. Render) arrancan con `node src/index.js`.
 * Este archivo reexporta el servidor real definido en `server.js`.
 */
// Este archivo solo reexporta el servidor real para evitar duplicidad de lógica.
// Mantenerlo garantiza compatibilidad con configuraciones antiguas que todavía
// ejecuten `node src/index.js` (por ejemplo, en Render si quedó el Start Command).
import './server.js';

