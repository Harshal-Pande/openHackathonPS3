import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp(config);

async function start() {
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`RevertLens API server running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
