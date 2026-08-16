import { Job, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { pool } from '../db/pool';
import { env } from '../config/env';
import {
  EMAIL_QUEUE_NAME,
  emailQueue,
} from './email.queue';
import { sendEmailViaSmtp } from '../services/smtp.service';
import { tryConsumeRateLimit } from '../services/rateLimit.service';

type EmailJob = {
  emailId: number;
};

/**
 * Returns the timestamp for the beginning of the next UTC hour.
 *
 * Example:
 *
 * 10:35 → 11:00
 * 10:59 → 11:00
 * 11:00 → 12:00
 */
function getNextHourTimestamp(date = new Date()): number {
  const nextHour = new Date(date);

  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(
    nextHour.getUTCHours() + 1
  );

  return nextHour.getTime();
}

/**
 * BullMQ email worker.
 *
 * Responsibilities:
 *
 * 1. Fetch email + campaign information
 * 2. Prevent duplicate sends
 * 3. Atomically claim an email
 * 4. Enforce Redis-backed hourly rate limiting
 * 5. Reschedule rate-limited emails
 * 6. Send email through Ethereal SMTP
 * 7. Persist sent/failed state
 * 8. Work safely with multiple concurrent workers
 */
export const emailWorker = new Worker<EmailJob>(
  EMAIL_QUEUE_NAME,

  async (job: Job<EmailJob>) => {
    const { emailId } = job.data;

    console.log('=================================');
    console.log('Email job received');
    console.log('Email ID:', emailId);
    console.log('=================================');

    /*
     * ----------------------------------------------------
     * 1. Fetch email + campaign
     * ----------------------------------------------------
     */
    const result = await pool.query(
      `
        SELECT
          se.id,
          se.campaign_id,
          se.recipient,
          se.scheduled_at,
          se.status,
          se.attempts,
          se.job_id,

          ec.subject,
          ec.body,
          ec.sender_email,
          ec.hourly_limit

        FROM scheduled_emails se

        INNER JOIN email_campaigns ec
          ON ec.id = se.campaign_id

        WHERE se.id = $1

        LIMIT 1
      `,
      [emailId]
    );

    const email = result.rows[0];

    /*
     * Email record does not exist.
     */
    if (!email) {
      throw new Error(
        `Email ${emailId} not found`
      );
    }

    /*
     * ----------------------------------------------------
     * 2. Idempotency check
     * ----------------------------------------------------
     *
     * If another worker already sent this email,
     * never send it again.
     */
    if (email.status === 'sent') {
      console.log(
        `Email ${emailId} already sent. Skipping.`
      );

      return {
        success: true,
        skipped: true,
        emailId,
      };
    }

    /*
     * ----------------------------------------------------
     * 3. Atomically claim the email
     * ----------------------------------------------------
     *
     * Only one worker can change:
     *
     * scheduled → processing
     *
     * This protects against duplicate processing when
     * multiple workers are running concurrently.
     *
     * We intentionally DO NOT increment attempts here.
     *
     * attempts represents actual SMTP send attempts,
     * not worker/rate-limit checks.
     */
    const claimResult = await pool.query(
      `
        UPDATE scheduled_emails

        SET
          status = 'processing',
          updated_at = NOW()

        WHERE id = $1

          AND status IN (
            'scheduled',
            'failed'
          )

          AND attempts < 3

        RETURNING *
      `,
      [emailId]
    );

    /*
     * Another worker already claimed/sent this email,
     * or retry limit has been reached.
     */
    if (claimResult.rowCount === 0) {
      console.log(
        `Email ${emailId} was already claimed, sent, or exceeded retry limit. Skipping.`
      );

      return {
        success: true,
        skipped: true,
        emailId,
      };
    }

    /*
     * ----------------------------------------------------
     * 4. Determine effective hourly limit
     * ----------------------------------------------------
     *
     * The campaign cannot exceed the global safety limit.
     *
     * Example:
     *
     * Campaign limit = 50
     * Global limit   = 200
     *
     * Effective limit = 50
     *
     * Campaign limit = 500
     * Global limit   = 200
     *
     * Effective limit = 200
     */
    const campaignLimit = Number(
      email.hourly_limit
    );

    const effectiveHourlyLimit = Math.min(
      campaignLimit,
      env.maxEmailsPerHour
    );

    /*
     * ----------------------------------------------------
     * 5. Redis-backed hourly rate limiter
     * ----------------------------------------------------
     */
    const rateLimit =
      await tryConsumeRateLimit(
        email.sender_email,
        effectiveHourlyLimit
      );

    /*
     * ----------------------------------------------------
     * 6. Rate limit exceeded
     * ----------------------------------------------------
     *
     * IMPORTANT:
     *
     * We do NOT use:
     *
     * job.moveToDelayed()
     *
     * because the current worker owns the BullMQ job lock.
     *
     * Instead:
     *
     * 1. Return DB record to scheduled
     * 2. Create a NEW delayed BullMQ job
     * 3. Save the new job ID
     * 4. Return normally
     */
    if (!rateLimit.allowed) {
      console.log(
        `Hourly limit reached for ${email.sender_email}.`
      );

      console.log(
        `Current count: ${rateLimit.count}`
      );

      console.log(
        `Effective hourly limit: ${effectiveHourlyLimit}`
      );

      console.log(
        `Rescheduling email ${emailId} for next hour.`
      );

      /*
       * Release the database claim.
       *
       * The email has NOT been sent, therefore it must
       * return to scheduled state.
       *
       * attempts is intentionally NOT changed.
       */
      await pool.query(
        `
          UPDATE scheduled_emails

          SET
            status = 'scheduled',
            updated_at = NOW()

          WHERE id = $1
        `,
        [emailId]
      );

      /*
       * Calculate beginning of next hour.
       */
      const nextHour =
        getNextHourTimestamp();

      /*
       * Deterministic job ID.
       *
       * This prevents accidental duplicate delayed jobs
       * for the same email + rate-limit window.
       */
      const rescheduledJobId =
        `email-${emailId}-rate-${nextHour}`;

      /*
       * Create a new delayed BullMQ job.
       */
      const rescheduledJob =
        await emailQueue.add(
          'send-email',

          {
            emailId,
          },

          {
            jobId: rescheduledJobId,

            delay: Math.max(
              0,
              nextHour - Date.now()
            ),

            /*
             * SMTP retry configuration.
             */
            attempts: 3,

            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          }
        );

      /*
       * Persist the new BullMQ job ID.
       */
      await pool.query(
        `
          UPDATE scheduled_emails

          SET
            job_id = $1,
            updated_at = NOW()

          WHERE id = $2
        `,
        [
          rescheduledJob.id,
          emailId,
        ]
      );

      console.log(
        `Email ${emailId} rescheduled successfully.`
      );

      console.log(
        `New BullMQ job ID: ${rescheduledJob.id}`
      );

      return {
        success: true,
        rescheduled: true,
        emailId,
      };
    }

    /*
     * ----------------------------------------------------
     * 7. Actual SMTP attempt
     * ----------------------------------------------------
     *
     * Only now do we increment attempts.
     */
    await pool.query(
      `
        UPDATE scheduled_emails

        SET
          attempts = attempts + 1,
          updated_at = NOW()

        WHERE id = $1
      `,
      [emailId]
    );

    const attemptNumber =
      Number(email.attempts) + 1;

    console.log(
      `Processing recipient: ${email.recipient}`
    );

    console.log(
      `Attempt: ${attemptNumber}`
    );

    /*
     * ----------------------------------------------------
     * 8. Send email through Ethereal SMTP
     * ----------------------------------------------------
     */
    try {
      await sendEmailViaSmtp({
        to: email.recipient,
        subject: email.subject,
        body: email.body,
        from: email.sender_email,
      });

      /*
       * ------------------------------------------------
       * 9. SMTP succeeded
       * ------------------------------------------------
       */
      await pool.query(
        `
          UPDATE scheduled_emails

          SET
            status = 'sent',
            sent_at = NOW(),
            failure_reason = NULL,
            updated_at = NOW()

          WHERE id = $1
        `,
        [emailId]
      );

      console.log(
        `Email ${emailId} marked as sent`
      );

      return {
        success: true,
        emailId,
      };

    } catch (error) {
      /*
       * ------------------------------------------------
       * 10. SMTP failed
       * ------------------------------------------------
       */
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown SMTP error';

      await pool.query(
        `
          UPDATE scheduled_emails

          SET
            status = 'failed',
            failure_reason = $1,
            updated_at = NOW()

          WHERE id = $2
        `,
        [
          message,
          emailId,
        ]
      );

      console.error(
        `Email ${emailId} failed:`,
        message
      );

      /*
       * Throwing the error allows BullMQ to perform
       * its configured retry/backoff.
       *
       * attempts:
       *   3
       *
       * backoff:
       *   5 seconds
       *   10 seconds
       */
      throw error;
    }
  },

  /*
   * ------------------------------------------------------
   * Worker configuration
   * ------------------------------------------------------
   */
  {
    connection: redis,

    /*
     * Configurable concurrency from .env.
     *
     * Example:
     *
     * WORKER_CONCURRENCY=5
     */
    concurrency:
      env.workerConcurrency,
  }
);

/*
 * --------------------------------------------------------
 * Worker events
 * --------------------------------------------------------
 */

emailWorker.on(
  'completed',
  (job) => {
    console.log(
      `Email job ${job.id} completed`
    );
  }
);

emailWorker.on(
  'failed',
  (job, error) => {
    console.error(
      `Email job ${job?.id ?? 'unknown'} failed:`,
      error.message
    );
  }
);