import { Router } from 'express';
import { z } from 'zod';

import { scheduleEmails } from '../services/email.service';
import { requireAuth } from '../middleware/auth.middleware';
import { pool } from '../db/pool';

const router = Router();

/*
 * =========================================================
 * Validation schema
 * =========================================================
 */

const scheduleSchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required'),

  body: z
    .string()
    .min(1, 'Email body is required'),

  recipients: z
    .array(z.string().email())
    .min(1, 'At least one recipient is required'),

  startTime: z
    .string()
    .min(1, 'Start time is required'),

  delayBetweenEmails: z
    .number()
    .min(0),

  hourlyLimit: z
    .number()
    .int()
    .positive(),
});

/*
 * =========================================================
 * POST /api/emails/schedule
 *
 * Create a campaign and schedule email jobs.
 * Authentication required.
 * =========================================================
 */

router.post(
  '/schedule',
  requireAuth,
  async (req, res, next) => {
    try {
      const input =
        scheduleSchema.parse(req.body);

      /*
       * requireAuth guarantees that an authenticated
       * user exists at runtime.
       *
       * The ! tells TypeScript that req.user
       * is not undefined at this point.
       */
      const userId = req.user!.id;

      const result =
        await scheduleEmails(
          input,
          userId
        );

      res.status(201).json({
        success: true,
        campaign: result.campaign,
        emails: result.emails,
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
 * =========================================================
 * GET /api/emails/scheduled
 *
 * Return scheduled and processing emails belonging
 * only to the authenticated user.
 * =========================================================
 */

router.get(
  '/scheduled',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.user!.id;

      const result = await pool.query(
        `
          SELECT
            se.id,
            se.campaign_id,
            se.recipient,
            se.scheduled_at,
            se.sent_at,
            se.status,
            se.attempts,
            se.job_id,
            se.failure_reason,
            se.created_at,
            se.updated_at,

            ec.subject,
            ec.body,
            ec.sender_email

          FROM scheduled_emails se

          INNER JOIN email_campaigns ec
            ON ec.id = se.campaign_id

          WHERE ec.user_id = $1

            AND se.status IN (
              'scheduled',
              'processing'
            )

          ORDER BY
            se.scheduled_at ASC
        `,
        [userId]
      );

      res.json({
        emails: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
 * =========================================================
 * GET /api/emails/sent
 *
 * Return sent and failed emails belonging only
 * to the authenticated user.
 * =========================================================
 */

router.get(
  '/sent',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.user!.id;

      const result = await pool.query(
        `
          SELECT
            se.id,
            se.campaign_id,
            se.recipient,
            se.scheduled_at,
            se.sent_at,
            se.status,
            se.attempts,
            se.job_id,
            se.failure_reason,
            se.created_at,
            se.updated_at,

            ec.subject,
            ec.body,
            ec.sender_email

          FROM scheduled_emails se

          INNER JOIN email_campaigns ec
            ON ec.id = se.campaign_id

          WHERE ec.user_id = $1

            AND se.status IN (
              'sent',
              'failed'
            )

          ORDER BY
            se.sent_at DESC NULLS LAST,
            se.created_at DESC
        `,
        [userId]
      );

      res.json({
        emails: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

export {
  router as emailRoutes,
};