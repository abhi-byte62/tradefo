import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export const createAuthMiddleware = (jwtSecret: string = 'tradeforge-dev-secret-key-2026') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
      req.userId = decoded.id;
      req.userEmail = decoded.email;
      next();
    } catch (err) {
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token is invalid or expired' });
    }
  };
};
