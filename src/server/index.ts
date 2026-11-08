import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp(config);

let isShuttingDown = false;

async function handleSignal(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}, initiating graceful shutdown...`);

  // Bounded force-exit timer prevents hanging if in-flight connections refuse to drain
  const forceExitTimeout = setTimeout(() => {
    console.error('Graceful shutdown timed out after 10s, forcing exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    await app.close();
    console.log('RevertLens server and database closed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('Error during server shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void handleSignal('SIGTERM'));
process.on('SIGINT', () => void handleSignal('SIGINT'));

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
