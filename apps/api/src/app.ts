import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from 'passport';

import authRoutes from './routes/auth.js';
import gameRoutes from './routes/games.js';
import userRoutes from './routes/users.js';
import friendsRoutes from './routes/friends.js';
import invitationsRoutes from './routes/invitations.js';
import migrateRoutes from './routes/migrate.js';
import { configureJwtStrategy } from './middleware/auth.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Allow all Vercel preview and production deployments
    if (origin.includes('vercel.app') && origin.includes('ginrummy')) {
      return callback(null, true);
    }
    
    // Allow specific CORS_ORIGIN if set
    if (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Authentication
app.use(passport.initialize());
configureJwtStrategy();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/auth', authRoutes);
app.use('/games', gameRoutes);
app.use('/users', userRoutes);
app.use('/friends', friendsRoutes);
app.use('/invitations', invitationsRoutes);
app.use('/admin', migrateRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

export default app;