import {
  Request,
  Response,
  NextFunction,
} from 'express';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  /*
   * Check Passport authentication.
   */

  if (
    !req.isAuthenticated ||
    !req.isAuthenticated()
  ) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  /*
   * Make sure Passport actually populated
   * req.user.
   */

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User session not found',
    });
  }

  next();
}