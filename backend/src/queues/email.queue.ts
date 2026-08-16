import { Queue } from 'bullmq';
import { redis } from '../config/redis';

export const EMAIL_QUEUE_NAME = 'email-scheduler';

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redis,
});