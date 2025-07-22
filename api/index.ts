import { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from 'dotenv';

// Load environment variables
config();

// Import the Express app
const getApp = async () => {
  const { default: app } = await import('../apps/api/src/app');
  return app;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
    
    // Adjust the URL to match Express routing expectations
    const originalUrl = req.url;
    req.url = req.url?.replace('/api', '') || '/';
    
    // If URL is empty or just '/', set it to the health endpoint for testing
    if (!req.url || req.url === '/') {
      req.url = '/health';
    }
    
    return app(req, res);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}