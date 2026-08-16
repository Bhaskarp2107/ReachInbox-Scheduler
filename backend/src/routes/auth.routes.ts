import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { pool } from '../db/pool';
import { env } from '../config/env';

const router = Router();

/*
 * ==================================================
 * Google OAuth Strategy
 * ==================================================
 */

passport.use(
  new GoogleStrategy(
    {
      clientID: env.googleClientId,
      clientSecret: env.googleClientSecret,
      callbackURL: env.googleCallbackUrl,
    },

    async (
      _accessToken,
      _refreshToken,
      profile,
      done
    ) => {
      try {
        const googleId = profile.id;

        const name =
          profile.displayName ||
          'Google User';

        const email =
          profile.emails?.[0]?.value;

        const avatarUrl =
          profile.photos?.[0]?.value ?? null;

        if (!email) {
          return done(
            new Error(
              'Google account does not have an email address'
            )
          );
        }

        const result = await pool.query(
          `
            INSERT INTO users
            (
              google_id,
              name,
              email,
              avatar_url
            )
            VALUES
            ($1, $2, $3, $4)

            ON CONFLICT (google_id)
            DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              avatar_url = EXCLUDED.avatar_url,
              updated_at = NOW()

            RETURNING
              id,
              google_id,
              name,
              email,
              avatar_url
          `,
          [
            googleId,
            name,
            email,
            avatarUrl,
          ]
        );

        const user = result.rows[0];

        return done(null, {
          id: Number(user.id),
          googleId: user.google_id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
        });
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

/*
 * ==================================================
 * Session serialization
 * ==================================================
 */

passport.serializeUser(
  (user, done) => {
    done(null, user.id);
  }
);

passport.deserializeUser(
  async (id: number, done) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            google_id,
            name,
            email,
            avatar_url
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

      if (result.rowCount === 0) {
        return done(null, false);
      }

      const user = result.rows[0];

      done(null, {
        id: Number(user.id),
        googleId: user.google_id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
      });
    } catch (error) {
      done(error);
    }
  }
);

/*
 * ==================================================
 * Login
 * ==================================================
 */

router.get(
  '/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
    ],
    session: true,
  })
);

/*
 * ==================================================
 * Google callback
 * ==================================================
 */

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect:
      `${env.frontendUrl}/?auth=failed`,
    session: true,
  }),
  (_req, res) => {
    res.redirect(env.frontendUrl);
  }
);

/*
 * ==================================================
 * Current user
 * ==================================================
 */

router.get(
  '/me',
  (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        authenticated: false,
        user: null,
      });
    }

    return res.json({
      authenticated: true,
      user: req.user,
    });
  }
);

/*
 * ==================================================
 * Logout
 * ==================================================
 */

router.post(
  '/logout',
  (req, res, next) => {
    req.logout((error) => {
      if (error) {
        return next(error);
      }

      req.session.destroy(
        (sessionError) => {
          if (sessionError) {
            return next(sessionError);
          }

          res.clearCookie('connect.sid');

          return res.json({
            success: true,
          });
        }
      );
    });
  }
);

export {
  router as authRoutes,
};