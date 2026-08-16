import cors from 'cors';
import express from 'express';
import session from 'express-session';
import passport from 'passport';

import { emailRoutes } from './routes/email.routes';
import { authRoutes } from './routes/auth.routes';
import { env } from './config/env';

const app = express();

/*
 * Render terminates HTTPS at its proxy.
 * Express needs to trust that proxy so secure
 * session cookies work correctly.
 */
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/*
 * CORS
 */
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  })
);

/*
 * Body parser
 */
app.use(express.json());

/*
 * Session
 */
app.use(
  session({
    secret: env.sessionSecret,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      secure: process.env.NODE_ENV === 'production',

      sameSite:
        process.env.NODE_ENV === 'production'
          ? 'none'
          : 'lax',

      maxAge:
        1000 *
        60 *
        60 *
        24 *
        7,
    },
  })
);
/*
 * Passport
 */
app.use(passport.initialize());
app.use(passport.session());

/*
 * Health
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'reachinbox-backend',
  });
});

/*
 * Authentication
 */
app.use(
  '/api/auth',
  authRoutes
);

/*
 * Email APIs
 */
app.use(
  '/api/emails',
  emailRoutes
);

export {
  app,
};
