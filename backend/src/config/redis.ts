import IORedis from 'ioredis';
import { env } from './env';

export const redis = new IORedis({
  host: env.redisHost,
  port: env.redisPort,

  // Required by BullMQ workers.
  maxRetriesPerRequest: null,
});