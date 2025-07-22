import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  await prisma.gameEvent.deleteMany();
  await prisma.eloHistory.deleteMany();
  await prisma.game.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleared existing data');

  // Create demo users
  const hashedPassword = await bcrypt.hash('password123', 12);

  const user1 = await prisma.user.create({
    data: {
      email: 'demo1@example.com',
      username: 'demo1',
      password: hashedPassword,
      elo: 1250,
      gamesPlayed: 15,
      gamesWon: 9,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'demo2@example.com',
      username: 'demo2',
      password: hashedPassword,
      elo: 1180,
      gamesPlayed: 12,
      gamesWon: 6,
    },
  });

  console.log('👥 Created demo users');

  // Create initial ELO history
  await prisma.eloHistory.createMany({
    data: [
      {
        userId: user1.id,
        elo: 1200,
        change: 0,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      },
      {
        userId: user1.id,
        elo: 1250,
        change: 50,
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      },
      {
        userId: user2.id,
        elo: 1200,
        change: 0,
        createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      },
      {
        userId: user2.id,
        elo: 1180,
        change: -20,
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      },
    ],
  });

  // Create some sample completed games
  const game1 = await prisma.game.create({
    data: {
      player1Id: user1.id,
      player2Id: user2.id,
      status: 'FINISHED',
      winnerId: user1.id,
      player1Score: 125,
      player2Score: 95,
      duration: 420, // 7 minutes
      knockType: 'GIN',
      isPrivate: false,
      vsAI: false,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      finishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 420000), // 10 days ago + 7 min
    },
  });

  const game2 = await prisma.game.create({
    data: {
      player1Id: user2.id,
      player2Id: user1.id,
      status: 'FINISHED',
      winnerId: user2.id,
      player1Score: 110,
      player2Score: 85,
      duration: 380, // 6 minutes 20 seconds
      knockType: 'KNOCK',
      isPrivate: false,
      vsAI: false,
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      finishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000 + 380000), // 8 days ago + 6:20
    },
  });

  // Create a public waiting game vs AI
  const aiGame = await prisma.game.create({
    data: {
      player1Id: user1.id,
      player2Id: null, // AI player - no actual user
      status: 'WAITING',
      isPrivate: false,
      vsAI: true,
      maxPlayers: 2,
    },
  });

  console.log('🎮 Created sample games');

  // Create some game events for the completed games
  await prisma.gameEvent.createMany({
    data: [
      {
        gameId: game1.id,
        userId: user1.id,
        eventType: 'game_start',
        eventData: { message: 'Game started' },
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
      {
        gameId: game1.id,
        userId: user1.id,
        eventType: 'gin',
        eventData: { playerId: user1.id, type: 'gin' },
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 400000),
      },
      {
        gameId: game1.id,
        userId: null,
        eventType: 'game_end',
        eventData: { winner: user1.id, knockType: 'gin' },
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 420000),
      },
    ],
  });

  console.log('📊 Created game events');

  console.log('✅ Database seeded successfully!');
  console.log('\n📝 Demo credentials:');
  console.log('   Username: demo1, Password: password123');
  console.log('   Username: demo2, Password: password123');
  console.log('\n🎯 Available endpoints:');
  console.log('   POST /auth/login');
  console.log('   POST /auth/register');
  console.log('   GET /games');
  console.log('   POST /games');
  console.log('   GET /users/profile/demo1');
  console.log('   GET /users/leaderboard');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });