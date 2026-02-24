import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { config } from 'dotenv';
import { apiRouter } from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') }); // Load from root of webapp

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

// Serve Vite-built frontend in production
if (isProd) {
  const clientDist = join(__dirname, '../../dist/client');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
    console.log(`📦 Serving built client from ${clientDist}`);
  }
}

const server = createServer(app);
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
