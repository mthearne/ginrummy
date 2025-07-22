import { createServer } from 'http';
import { config } from 'dotenv';
import app from './app.js';
import { initializeSocket } from './socket/index.js';

// Load environment variables
config();

const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = createServer(app);

// Initialize Socket.io
initializeSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});