import 'express';

declare global {
  namespace Express {
    interface User {
      id: number;
      googleId: string;
      name: string;
      email: string;
      avatarUrl?: string | null;
    }
  }
}

export {};