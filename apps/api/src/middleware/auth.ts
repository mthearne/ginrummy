import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

/**
 * Configure JWT strategy for Passport
 */
export function configureJwtStrategy() {
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: JWT_SECRET,
      },
      async (payload, done) => {
        try {
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
              id: true,
              email: true,
              username: true,
              elo: true,
              gamesPlayed: true,
              gamesWon: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          if (user) {
            return done(null, user);
          } else {
            return done(null, false);
          }
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
}

/**
 * Middleware to require authentication
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = user;
    next();
  })(req, res, next);
};

/**
 * Middleware to optionally authenticate
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any) => {
    if (err) {
      return next(err);
    }
    req.user = user || null;
    next();
  })(req, res, next);
};

/**
 * Type for authenticated request
 */
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    elo: number;
    gamesPlayed: number;
    gamesWon: number;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Helper to create authenticated route handlers
 */
export function createAuthenticatedHandler(
  handler: (req: AuthenticatedRequest, res: Response, next?: NextFunction) => Promise<any> | any
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthenticatedRequest, res, next);
  };
}