import 'dotenv/config';

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 5000),

  databaseUrl: getEnv('DATABASE_URL'),

  redisUrl: getEnv('REDIS_URL'),

  frontendUrl:
    process.env.FRONTEND_URL ?? 'http://localhost:5173',

  workerConcurrency:
    Number(process.env.WORKER_CONCURRENCY ?? 5),

  minEmailDelayMs:
    Number(process.env.MIN_EMAIL_DELAY_MS ?? 2000),

  maxEmailsPerHour:
    Number(process.env.MAX_EMAILS_PER_HOUR ?? 200),

  defaultSenderEmail:
    getEnv('DEFAULT_SENDER_EMAIL'),

  smtpHost:
    process.env.SMTP_HOST ?? 'smtp.ethereal.email',

  smtpPort:
    Number(process.env.SMTP_PORT ?? 587),

  smtpSecure:
    process.env.SMTP_SECURE === 'true',

  smtpUser:
    getEnv('SMTP_USER'),

  smtpPassword:
    getEnv('SMTP_PASSWORD'),

  googleClientId:
    getEnv('GOOGLE_CLIENT_ID'),

  googleClientSecret:
    getEnv('GOOGLE_CLIENT_SECRET'),

  googleCallbackUrl:
    getEnv('GOOGLE_CALLBACK_URL'),

  sessionSecret:
    getEnv('SESSION_SECRET'),
};
