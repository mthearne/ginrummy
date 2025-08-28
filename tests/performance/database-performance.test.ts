import { test, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';
import bcrypt from 'bcryptjs';

describe('Database Performance Tests', () => {
  let prisma: PrismaClient;
  
  // Performance thresholds (in milliseconds) - More realistic for Supabase remote database
  const DB_THRESHOLDS = {
    SIMPLE_SELECT: 1000,     // Simple SELECT queries (remote DB)
    COMPLEX_JOIN: 2000,      // Complex queries with joins
    INSERT_OPERATION: 1000,  // Single INSERT operations
    BULK_INSERT: 2500,       // Bulk INSERT operations
    UPDATE_OPERATION: 1000,  // UPDATE operations
    DELETE_OPERATION: 1000,  // DELETE operations
    TRANSACTION: 2000,       // Database transactions
    CONNECTION: 3000,        // Database connection time
    CONCURRENT_QUERIES: 3000 // Concurrent query handling
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper function to measure database query time
  async function measureQuery<T>(
    queryFn: () => Promise<T>,
    threshold: number,
    description: string
  ): Promise<{ result: T; queryTime: number }> {
    const startTime = performance.now();
    const result = await queryFn();
    const endTime = performance.now();
    const queryTime = endTime - startTime;
    
    console.log(`${description}: ${queryTime.toFixed(2)}ms`);
    expect(queryTime).toBeLessThan(threshold);
    
    return { result, queryTime };
  }

  test('Database connection performance', async () => {
    const startTime = performance.now();
    
    // Test connection by running a simple query
    await prisma.$queryRaw`SELECT 1 as test`;
    
    const connectionTime = performance.now() - startTime;
    
    expect(connectionTime).toBeLessThan(DB_THRESHOLDS.CONNECTION);
    console.log(`Database connection time: ${connectionTime.toFixed(2)}ms`);
  });

  test('Simple SELECT query performance', async () => {
    await measureQuery(
      () => prisma.user.findMany({ take: 10 }),
      DB_THRESHOLDS.SIMPLE_SELECT,
      'Simple user SELECT'
    );
  });

  test('User authentication query performance', async () => {
    // Test the typical login query performance
    await measureQuery(
      () => prisma.user.findUnique({
        where: { email: 'demo1@example.com' }
      }),
      DB_THRESHOLDS.SIMPLE_SELECT,
      'User login query'
    );
  });

  test('Game listing query performance', async () => {
    await measureQuery(
      () => prisma.game.findMany({
        where: { status: 'WAITING' },
        take: 20,
        orderBy: { createdAt: 'desc' }
      }),
      DB_THRESHOLDS.SIMPLE_SELECT,
      'Game listing query'
    );
  });

  test('User games with stats query performance', async () => {
    // This simulates the my-games endpoint query
    await measureQuery(
      () => prisma.game.findMany({
        where: { 
          OR: [
            { player1Id: 'demo-user-id' },
            { player2Id: 'demo-user-id' }
          ]
        },
        include: {
          player1: {
            select: {
              username: true,
              elo: true
            }
          }
        },
        take: 20,
        orderBy: { updatedAt: 'desc' }
      }),
      DB_THRESHOLDS.COMPLEX_JOIN,
      'User games with joins'
    );
  });

  test('Game state retrieval performance', async () => {
    // Create a test user and game
    const timestamp = Date.now();
    const testUser = await prisma.user.create({
      data: {
        email: `perf-test-game-${timestamp}@example.com`,
        username: `perfgame${timestamp}`,
        password: 'hashedpass',
        elo: 1200
      }
    });
    
    const testGame = await prisma.game.create({
      data: {
        player1Id: testUser.id,
        status: 'ACTIVE',
        vsAI: true,
        gameState: {
          phase: 'draw',
          currentPlayerId: testUser.id,
          players: [],
          discardPile: [],
          stockPileCount: 31
        }
      }
    });

    await measureQuery(
      () => prisma.game.findUnique({
        where: { id: testGame.id },
        include: {
          player1: true,
          gameEvents: {
            orderBy: { timestamp: 'asc' }
          }
        }
      }),
      DB_THRESHOLDS.COMPLEX_JOIN,
      'Game state with events'
    );

    // Cleanup
    await prisma.game.delete({ where: { id: testGame.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  test('User creation performance', async () => {
    const timestamp = Date.now();
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    
    const { result: user } = await measureQuery(
      () => prisma.user.create({
        data: {
          email: `perf-test-${timestamp}@example.com`,
          username: `perftest${timestamp}`,
          password: hashedPassword,
          elo: 1200
        }
      }),
      DB_THRESHOLDS.INSERT_OPERATION,
      'User creation'
    );

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
  });

  test('Game creation performance', async () => {
    const timestamp = Date.now();
    
    // Create test user first
    const testUser = await prisma.user.create({
      data: {
        email: `game-perf-${timestamp}@example.com`,
        username: `gameperf${timestamp}`,
        password: 'hashedpass',
        elo: 1200
      }
    });
    
    const { result: game } = await measureQuery(
      () => prisma.game.create({
        data: {
          player1Id: testUser.id,
          status: 'WAITING',
          vsAI: false,
          gameState: {
            phase: 'waiting',
            players: [],
            discardPile: [],
            stockPileCount: 52
          }
        }
      }),
      DB_THRESHOLDS.INSERT_OPERATION,
      'Game creation'
    );

    // Cleanup
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  test('Bulk game events insertion performance', async () => {
    // Create a test user and game
    const timestamp = Date.now();
    const testUser = await prisma.user.create({
      data: {
        email: `bulk-test-${timestamp}@example.com`,
        username: `bulktest${timestamp}`,
        password: 'hashedpass',
        elo: 1200
      }
    });
    
    const testGame = await prisma.game.create({
      data: {
        player1Id: testUser.id,
        status: 'ACTIVE',
        vsAI: true,
        gameState: { phase: 'draw', players: [] }
      }
    });

    // Prepare bulk game events
    const gameEvents = Array.from({ length: 50 }, (_, index) => ({
      gameId: testGame.id,
      userId: testUser.id,
      eventType: 'move',
      eventData: {
        type: 'draw',
        source: 'stock',
        sequence: index
      }
    }));

    await measureQuery(
      () => prisma.gameEvent.createMany({
        data: gameEvents
      }),
      DB_THRESHOLDS.BULK_INSERT,
      'Bulk game events insertion'
    );

    // Cleanup
    await prisma.gameEvent.deleteMany({ where: { gameId: testGame.id } });
    await prisma.game.delete({ where: { id: testGame.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  test('Game state update performance', async () => {
    // Create a test user and game
    const testUser = await prisma.user.create({
      data: {
        email: 'update-test@example.com',
        username: 'updatetest',
        password: 'hashedpass',
        elo: 1200
      }
    });
    
    const testGame = await prisma.game.create({
      data: {
        player1Id: testUser.id,
        status: 'WAITING',
        vsAI: true,
        gameState: { phase: 'waiting', players: [] }
      }
    });

    const newGameState = {
      phase: 'draw',
      currentPlayerId: 'test-user-update',
      players: [
        { id: 'test-user-update', cards: [], score: 0 }
      ],
      discardPile: [],
      stockPileCount: 31
    };

    await measureQuery(
      () => prisma.game.update({
        where: { id: testGame.id },
        data: {
          status: 'ACTIVE',
          gameState: newGameState,
          updatedAt: new Date()
        }
      }),
      DB_THRESHOLDS.UPDATE_OPERATION,
      'Game state update'
    );

    // Cleanup
    await prisma.game.delete({ where: { id: testGame.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  test('ELO rating update performance', async () => {
    // Create test users with unique emails
    const timestamp = Date.now();
    const user1 = await prisma.user.create({
      data: {
        email: `elo-test-1-${timestamp}@example.com`,
        username: `elotest1${timestamp}`,
        password: 'hashedpass',
        elo: 1200
      }
    });

    await measureQuery(
      () => prisma.user.update({
        where: { id: user1.id },
        data: { 
          elo: 1250,
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: 1 }
        }
      }),
      DB_THRESHOLDS.UPDATE_OPERATION,
      'ELO rating update'
    );

    // Cleanup
    await prisma.user.delete({ where: { id: user1.id } });
  });

  test('Transaction performance', async () => {
    // Test a typical game completion transaction
    const timestamp = Date.now();
    const user1 = await prisma.user.create({
      data: {
        email: `tx-test-1-${timestamp}@example.com`,
        username: `txtest1${timestamp}`,
        password: 'hashedpass',
        elo: 1200
      }
    });

    const user2 = await prisma.user.create({
      data: {
        email: `tx-test-2-${timestamp}@example.com`,
        username: `txtest2${timestamp}`,
        password: 'hashedpass',
        elo: 1180
      }
    });

    const testGame = await prisma.game.create({
      data: {
        player1Id: user1.id,
        player2Id: user2.id,
        status: 'ACTIVE',
        vsAI: false,
        gameState: { phase: 'completed', winner: user1.id }
      }
    });

    await measureQuery(
      () => prisma.$transaction(async (tx) => {
        // Update game status
        await tx.game.update({
          where: { id: testGame.id },
          data: { status: 'FINISHED' }
        });

        // Update winner ELO
        await tx.user.update({
          where: { id: user1.id },
          data: { 
            elo: 1220,
            gamesWon: { increment: 1 },
            gamesPlayed: { increment: 1 }
          }
        });

        // Update loser ELO
        await tx.user.update({
          where: { id: user2.id },
          data: { 
            elo: 1160,
            gamesPlayed: { increment: 1 }
          }
        });

        // Create ELO history entries
        await tx.eloHistory.createMany({
          data: [
            {
              userId: user1.id,
              gameId: testGame.id,
              elo: 1220,
              change: 20
            },
            {
              userId: user2.id,
              gameId: testGame.id,
              elo: 1160,
              change: -20
            }
          ]
        });
      }),
      DB_THRESHOLDS.TRANSACTION,
      'Game completion transaction'
    );

    // Cleanup
    await prisma.eloHistory.deleteMany({ 
      where: { gameId: testGame.id } 
    });
    await prisma.game.delete({ where: { id: testGame.id } });
    await prisma.user.delete({ where: { id: user1.id } });
    await prisma.user.delete({ where: { id: user2.id } });
  });

  test('Concurrent database operations', async () => {
    const concurrentOperations = 20;
    
    const startTime = performance.now();
    
    // Create multiple concurrent simple queries
    const promises = Array.from({ length: concurrentOperations }, (_, index) =>
      prisma.user.findMany({
        where: {
          username: {
            contains: 'demo'
          }
        },
        take: 5
      })
    );

    await Promise.all(promises);
    
    const totalTime = performance.now() - startTime;
    
    expect(totalTime).toBeLessThan(DB_THRESHOLDS.CONCURRENT_QUERIES);
    console.log(`${concurrentOperations} concurrent queries completed in ${totalTime.toFixed(2)}ms`);
  });

  test('Index performance validation', async () => {
    // Test queries that should use indexes efficiently
    const indexTests = [
      {
        name: 'User email index',
        query: () => prisma.user.findUnique({
          where: { email: 'demo1@example.com' }
        }),
        threshold: DB_THRESHOLDS.SIMPLE_SELECT
      },
      {
        name: 'User username index',
        query: () => prisma.user.findUnique({
          where: { username: 'demo1' }
        }),
        threshold: DB_THRESHOLDS.SIMPLE_SELECT
      },
      {
        name: 'Game status index',
        query: () => prisma.game.findMany({
          where: { status: 'WAITING' },
          take: 10
        }),
        threshold: DB_THRESHOLDS.SIMPLE_SELECT
      },
      {
        name: 'Game player1Id index',
        query: () => prisma.game.findMany({
          where: { player1Id: 'demo-user-id' },
          take: 10
        }),
        threshold: DB_THRESHOLDS.SIMPLE_SELECT
      }
    ];

    for (const test of indexTests) {
      await measureQuery(
        test.query,
        test.threshold,
        test.name
      );
    }
  });

  test('Database connection pool performance', async () => {
    // Test connection pool by making many simultaneous connections
    const connections = 10;
    
    const startTime = performance.now();
    
    const promises = Array.from({ length: connections }, async () => {
      const tempPrisma = new PrismaClient();
      await tempPrisma.$connect();
      
      // Perform a simple query
      const result = await tempPrisma.user.count();
      
      await tempPrisma.$disconnect();
      return result;
    });

    await Promise.all(promises);
    
    const totalTime = performance.now() - startTime;
    
    expect(totalTime).toBeLessThan(DB_THRESHOLDS.CONCURRENT_QUERIES);
    console.log(`${connections} database connections handled in ${totalTime.toFixed(2)}ms`);
  });

  test('Large result set performance', async () => {
    // Test handling of larger result sets
    await measureQuery(
      () => prisma.user.findMany({
        take: 100,
        include: {
          player1Games: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          eloHistory: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      }),
      DB_THRESHOLDS.COMPLEX_JOIN * 2, // Allow more time for larger result sets
      'Large result set with includes'
    );
  });

  test('Query optimization check', async () => {
    // Test a potentially expensive query and ensure it's optimized
    const startTime = performance.now();
    
    const result = await prisma.$queryRaw`
      SELECT 
        u.username,
        u.elo,
        COUNT(g.id) as total_games,
        AVG(CASE WHEN g.winner_id = u.id THEN 1 ELSE 0 END) as win_rate
      FROM "users" u
      LEFT JOIN "games" g ON (g.player1_id = u.id OR g.player2_id = u.id OR g.winner_id = u.id)
      GROUP BY u.id, u.username, u.elo
      ORDER BY u.elo DESC
      LIMIT 10
    `;
    
    const queryTime = performance.now() - startTime;
    
    expect(queryTime).toBeLessThan(DB_THRESHOLDS.COMPLEX_JOIN);
    console.log(`Complex aggregation query: ${queryTime.toFixed(2)}ms`);
    console.log(`Results: ${Array.isArray(result) ? result.length : 0} rows`);
  });
});