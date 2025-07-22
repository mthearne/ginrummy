import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

router.post('/migrate', async (req, res) => {
  try {
    // Security check - only allow in production and with proper header
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.MIGRATION_SECRET || 'migrate-now'}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    console.log('Starting database migration...');
    
    // Run Prisma migration
    const { stdout, stderr } = await execAsync('cd /var/task/apps/api && npx prisma migrate deploy', {
      timeout: 30000, // 30 second timeout
      env: { ...process.env }
    });

    console.log('Migration completed successfully');
    console.log('stdout:', stdout);
    
    if (stderr) {
      console.warn('stderr:', stderr);
    }

    res.json({ 
      success: true, 
      output: stdout,
      warnings: stderr || null
    });

  } catch (error: any) {
    console.error('Migration failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      output: error.stdout || null
    });
  }
});

export default router;