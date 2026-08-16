import { pool } from '../db/pool';
import { env } from '../config/env';
import { emailQueue } from '../queues/email.queue';

export interface ScheduleEmailInput {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
}

/*
 * =========================================================
 * Schedule Emails
 * =========================================================
 *
 * Creates:
 *
 * 1. Email campaign
 * 2. Scheduled email records
 * 3. BullMQ jobs
 *
 * The campaign belongs to the authenticated user.
 * =========================================================
 */

export async function scheduleEmails(
  input: ScheduleEmailInput,
  userId: number
) {
  /*
   * -------------------------------------------------------
   * Validate start time
   * -------------------------------------------------------
   */

  const startTime =
    new Date(input.startTime);

  if (
    Number.isNaN(
      startTime.getTime()
    )
  ) {
    throw new Error(
      'Invalid start time'
    );
  }

  /*
   * Do not allow scheduling in the past.
   */

  if (
    startTime.getTime() < Date.now()
  ) {
    throw new Error(
      'Start time must be in the future'
    );
  }

  /*
   * -------------------------------------------------------
   * Determine email delay
   * -------------------------------------------------------
   *
   * The configured minimum delay protects the SMTP
   * service from emails being sent too quickly.
   */

  const delayMs = Math.max(
    input.delayBetweenEmails,
    env.minEmailDelayMs
  );

  /*
   * -------------------------------------------------------
   * Create campaign
   * -------------------------------------------------------
   *
   * IMPORTANT:
   *
   * Previously this was hard-coded to user ID 1.
   *
   * Now the authenticated user's ID is used.
   */

  const campaignResult =
    await pool.query(
      `
        INSERT INTO email_campaigns
        (
          user_id,
          subject,
          body,
          start_time,
          delay_ms,
          hourly_limit,
          sender_email
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )

        RETURNING *
      `,
      [
        userId,
        input.subject,
        input.body,
        startTime,
        delayMs,
        input.hourlyLimit,
        env.defaultSenderEmail,
      ]
    );

  const campaign =
    campaignResult.rows[0];

  /*
   * -------------------------------------------------------
   * Create scheduled emails
   * -------------------------------------------------------
   */

  const emails = [];

  for (
    let index = 0;
    index < input.recipients.length;
    index++
  ) {
    const recipient =
      input.recipients[index];

    /*
     * Each recipient gets a different scheduled time.
     *
     * Example:
     *
     * start = 10:00
     * delay = 2 seconds
     *
     * email 1 -> 10:00
     * email 2 -> 10:00:02
     * email 3 -> 10:00:04
     */

    const scheduledAt =
      new Date(
        startTime.getTime() +
        index * delayMs
      );

    /*
     * -----------------------------------------------------
     * Insert email record
     * -----------------------------------------------------
     */

    const emailResult =
      await pool.query(
        `
          INSERT INTO scheduled_emails
          (
            campaign_id,
            recipient,
            scheduled_at,
            status
          )

          VALUES
          (
            $1,
            $2,
            $3,
            'scheduled'
          )

          RETURNING *
        `,
        [
          campaign.id,
          recipient,
          scheduledAt,
        ]
      );

    const email =
      emailResult.rows[0];

    /*
     * -----------------------------------------------------
     * Create BullMQ job
     * -----------------------------------------------------
     */

    const delay =
      Math.max(
        0,
        scheduledAt.getTime() -
          Date.now()
      );

    const job =
      await emailQueue.add(
        'send-email',
        {
          emailId: email.id,
        },
        {
          jobId:
            `email-${email.id}`,

          delay,
        }
      );

    /*
     * -----------------------------------------------------
     * Store BullMQ job ID
     * -----------------------------------------------------
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
        job.id,
        email.id,
      ]
    );

    /*
     * Add the email to response.
     */

    emails.push({
      ...email,
      job_id: job.id,
    });
  }

  /*
   * -------------------------------------------------------
   * Return campaign + scheduled emails
   * -------------------------------------------------------
   */

  return {
    campaign,
    emails,
  };
}