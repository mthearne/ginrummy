import { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from 'dotenv';

// Load environment variables
config();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { default: app } = await import('../../apps/api/src/app');
    
    // Set the correct route for Express
    req.url = '/auth/login';
    
    return app(req, res);
  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}