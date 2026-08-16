import { app } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { emailWorker } from './queues/email.worker';

async function bootstrap() {
  await pool.query('SELECT 1');

  console.log('PostgreSQL connected');

  app.listen(env.port, () => {
    console.log(
      `Backend listening on http://localhost:${env.port}`
    );
  });
}

async function shutdown() {
  console.log('Shutting down...');

  await emailWorker.close();
  await pool.end();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});