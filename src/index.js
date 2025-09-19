import 'dotenv/config'            // carga .env
import express from "express";
import cors from "cors";

import path from "path";
import { fileURLToPath } from "url";
import reservasRouter from "./routes/reservas.routes.js";


const app = express();

// Servir archivos estáticos desde /public
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));

// Ruta principal para la interfaz de cliente
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/client/index.html"));
});

app.use(cors());
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

// Listar tablas
app.get('/db/tables', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Montar rutas de reservas
app.use(reservasRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});