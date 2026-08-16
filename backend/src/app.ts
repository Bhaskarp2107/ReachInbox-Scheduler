import cors from 'cors';
import express from 'express';
import session from 'express-session';
import passport from 'passport';

import { emailRoutes } from './routes/email.routes';
import { authRoutes } from './routes/auth.routes';
import { env } from './config/env';

const app = express();

/*
 * ==================================================
 * CORS
 * ==================================================
 */

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  })
);

/*
 * ==================================================
 * Body parser
 * ==================================================
 */

app.use(express.json());

/*
 * ==================================================
 * Session
 * ==================================================
 */

app.use(
  session({
    secret: env.sessionSecret,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
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
 * ==================================================
 * Passport
 * ==================================================
 */

app.use(passport.initialize());
app.use(passport.session());

/*
 * ==================================================
 * Health
 * ==================================================
 */

app.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    service: 'reachinbox-backend',
  });
});

/*
 * ==================================================
 * Authentication
 * ==================================================
 */

app.use(
  '/api/auth',
  authRoutes
);

/*
 * ==================================================
 * Email APIs
 * ==================================================
 */

app.use(
  '/api/emails',
  emailRoutes
);

export {
  app,
};