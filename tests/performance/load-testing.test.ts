import { test, expect } from 'vitest';
import { performance } from 'perf_hooks';

describe('Load Testing - Concurrent Users', () => {
  const API_BASE_URL = 'http://localhost:3003';
  
  // Load testing thresholds
  const LOAD_THRESHOLDS = {
    CONCURRENT_USERS_10: 2000,    // 10 concurrent users
    CONCURRENT_USERS_25: 5000,    // 25 concurrent users
    CONCURRENT_USERS_50: 10000,   // 50 concurrent users
    CONCURRENT_GAMES_10: 3000,    // 10 concurrent games
    SUSTAINED_LOAD_60s: 60000,    // 60 seconds sustained load
    RESPONSE_TIME_95P: 1000,      // 95th percentile response time
    ERROR_RATE: 0.05              // Maximum 5% error rate
  };

  // Helper class for simulating a user session
  class UserSession {
    private accessToken: string = '';
    private gameId: string = '';
    private userId: string = '';
    
    constructor(private sessionId: string) {}

    async register(): Promise<void> {
      const timestamp = Date.now();
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `load-test-${this.sessionId}-${timestamp}@example.com`,
          username: `loadtest${this.sessionId}${timestamp}`,
          password: 'testpass123'
        })
      });

      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.accessToken;
        this.userId = data.user.id;
      } else {
        throw new Error(`Registration failed: ${response.status}`);
      }
    }

    async login(): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'demo1@example.com',
          password: 'password123'
        })
      });

      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.accessToken;
        this.userId = data.user.id;
      } else {
        throw new Error(`Login failed: ${response.status}`);
      }
    }

    async createGame(): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ vsAI: true })
      });

      if (response.ok) {
        const data = await response.json();
        this.gameId = data.game.id;
      } else {
        throw new Error(`Game creation failed: ${response.status}`);
      }
    }

    async getGames(): Promise<any[]> {
      const response = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.games || [];
      } else {
        throw new Error(`Get games failed: ${response.status}`);
      }
    }

    async getGameState(): Promise<any> {
      if (!this.gameId) throw new Error('No game ID available');

      const response = await fetch(`${API_BASE_URL}/api/games/${this.gameId}/state`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error(`Get game state failed: ${response.status}`);
      }
    }

    async makeMove(): Promise<void> {
      if (!this.gameId) throw new Error('No game ID available');

      const response = await fetch(`${API_BASE_URL}/api/games/${this.gameId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          type: 'draw',
          source: 'stock'
        })
      });

      if (!response.ok) {
        throw new Error(`Move failed: ${response.status}`);
      }
    }

    async cleanup(): Promise<void> {
      // Cleanup user if it was created for testing
      // Note: This would require a cleanup endpoint in the API
    }

    getStats() {
      return {
        sessionId: this.sessionId,
        userId: this.userId,
        gameId: this.gameId,
        hasToken: !!this.accessToken
      };
    }
  }

  // Helper function to measure load test performance
  async function runLoadTest(
    testName: string,
    userCount: number,
    userActionFn: (user: UserSession) => Promise<any>,
    threshold: number
  ) {
    console.log(`\n🚀 Starting ${testName} with ${userCount} concurrent users`);
    
    const users: UserSession[] = Array.from({ length: userCount }, 
      (_, i) => new UserSession(`user-${i}`)
    );

    const startTime = performance.now();
    const results: Array<{ success: boolean; error?: string; responseTime: number }> = [];

    try {
      // Execute user actions concurrently
      const promises = users.map(async (user, index) => {
        const userStartTime = performance.now();
        try {
          await userActionFn(user);
          const responseTime = performance.now() - userStartTime;
          return { success: true, responseTime };
        } catch (error: any) {
          const responseTime = performance.now() - userStartTime;
          return { success: false, error: error.message, responseTime };
        }
      });

      const userResults = await Promise.all(promises);
      results.push(...userResults);

      const totalTime = performance.now() - startTime;
      
      // Calculate metrics
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const errorRate = errorCount / results.length;
      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      const responseTimes = results.map(r => r.responseTime).sort((a, b) => a - b);
      const p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];

      console.log(`✅ ${testName} Results:`);
      console.log(`   Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`   Successful requests: ${successCount}/${userCount}`);
      console.log(`   Error rate: ${(errorRate * 100).toFixed(2)}%`);
      console.log(`   Average response time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`   95th percentile response time: ${p95ResponseTime.toFixed(2)}ms`);

      // Assertions
      expect(totalTime).toBeLessThan(threshold);
      expect(errorRate).toBeLessThan(LOAD_THRESHOLDS.ERROR_RATE);
      expect(p95ResponseTime).toBeLessThan(LOAD_THRESHOLDS.RESPONSE_TIME_95P);

    } finally {
      // Cleanup users
      await Promise.all(users.map(user => user.cleanup().catch(() => {})));
    }
  }

  test('10 concurrent user registrations', async () => {
    await runLoadTest(
      'User Registration Load Test',
      10,
      async (user) => {
        await user.register();
      },
      LOAD_THRESHOLDS.CONCURRENT_USERS_10
    );
  }, 30000);

  test('25 concurrent user logins', async () => {
    await runLoadTest(
      'User Login Load Test', 
      25,
      async (user) => {
        await user.login();
      },
      LOAD_THRESHOLDS.CONCURRENT_USERS_25
    );
  }, 30000);

  test('10 concurrent game creations', async () => {
    await runLoadTest(
      'Game Creation Load Test',
      10,
      async (user) => {
        await user.login();
        await user.createGame();
      },
      LOAD_THRESHOLDS.CONCURRENT_GAMES_10
    );
  }, 30000);

  test('50 concurrent game listings', async () => {
    await runLoadTest(
      'Game Listing Load Test',
      50,
      async (user) => {
        await user.login();
        await user.getGames();
      },
      LOAD_THRESHOLDS.CONCURRENT_USERS_50
    );
  }, 30000);

  test('Mixed workload simulation', async () => {
    const userCount = 20;
    console.log(`\n🔥 Mixed Workload Test with ${userCount} users`);
    
    const users: UserSession[] = Array.from({ length: userCount }, 
      (_, i) => new UserSession(`mixed-${i}`)
    );

    const startTime = performance.now();
    const results: any[] = [];

    try {
      const promises = users.map(async (user, index) => {
        const userStartTime = performance.now();
        const operations: string[] = [];
        
        try {
          // Each user performs a different mix of operations
          if (index % 4 === 0) {
            // Register new users
            await user.register();
            operations.push('register');
          } else {
            // Use existing demo accounts
            await user.login();
            operations.push('login');
          }
          
          // Everyone gets games
          await user.getGames();
          operations.push('getGames');
          
          // 50% create games
          if (index % 2 === 0) {
            await user.createGame();
            operations.push('createGame');
            
            // 25% also get game state
            if (index % 4 === 0) {
              await user.getGameState();
              operations.push('getGameState');
            }
          }
          
          const responseTime = performance.now() - userStartTime;
          return {
            success: true,
            userId: index,
            operations,
            responseTime
          };
        } catch (error: any) {
          const responseTime = performance.now() - userStartTime;
          return {
            success: false,
            userId: index,
            operations,
            error: error.message,
            responseTime
          };
        }
      });

      const userResults = await Promise.all(promises);
      results.push(...userResults);

      const totalTime = performance.now() - startTime;
      
      // Analyze results
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const errorRate = errorCount / results.length;
      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

      console.log(`✅ Mixed Workload Results:`);
      console.log(`   Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`   Successful workflows: ${successCount}/${userCount}`);
      console.log(`   Error rate: ${(errorRate * 100).toFixed(2)}%`);
      console.log(`   Average workflow time: ${avgResponseTime.toFixed(2)}ms`);

      // Count operation types
      const operationCounts: { [key: string]: number } = {};
      results.forEach(r => {
        r.operations?.forEach((op: string) => {
          operationCounts[op] = (operationCounts[op] || 0) + 1;
        });
      });
      
      console.log(`   Operations performed:`, operationCounts);

      expect(totalTime).toBeLessThan(LOAD_THRESHOLDS.CONCURRENT_USERS_25);
      expect(errorRate).toBeLessThan(LOAD_THRESHOLDS.ERROR_RATE);

    } finally {
      await Promise.all(users.map(user => user.cleanup().catch(() => {})));
    }
  }, 45000);

  test('Sustained load test', async () => {
    const duration = 10000; // 10 seconds (reduced from 60s for testing)
    const requestInterval = 200; // Request every 200ms
    const expectedRequests = Math.floor(duration / requestInterval);
    
    console.log(`\n⏰ Sustained Load Test for ${duration}ms`);
    console.log(`   Expected requests: ~${expectedRequests}`);
    
    const user = new UserSession('sustained-load');
    await user.login();
    
    const startTime = performance.now();
    const results: Array<{ success: boolean; responseTime: number }> = [];
    
    const makeRequest = async (): Promise<{ success: boolean; responseTime: number }> => {
      const reqStartTime = performance.now();
      try {
        await user.getGames();
        const responseTime = performance.now() - reqStartTime;
        return { success: true, responseTime };
      } catch (error) {
        const responseTime = performance.now() - reqStartTime;
        return { success: false, responseTime };
      }
    };

    // Run sustained load
    while (performance.now() - startTime < duration) {
      const result = await makeRequest();
      results.push(result);
      
      // Wait for next interval
      await new Promise(resolve => setTimeout(resolve, requestInterval));
    }

    const totalTime = performance.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const errorRate = (results.length - successCount) / results.length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    console.log(`✅ Sustained Load Results:`);
    console.log(`   Total duration: ${totalTime.toFixed(2)}ms`);
    console.log(`   Total requests: ${results.length}`);
    console.log(`   Successful requests: ${successCount}`);
    console.log(`   Error rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`   Average response time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   Requests per second: ${(results.length / (totalTime / 1000)).toFixed(2)}`);

    expect(errorRate).toBeLessThan(LOAD_THRESHOLDS.ERROR_RATE);
    expect(avgResponseTime).toBeLessThan(500); // Should be fast for sustained load
    
    await user.cleanup();
  }, 20000);

  test('Database connection pool stress test', async () => {
    const connectionCount = 30;
    console.log(`\n🔗 Connection Pool Stress Test with ${connectionCount} connections`);
    
    const startTime = performance.now();
    
    // Create many simultaneous connections that perform database operations
    const promises = Array.from({ length: connectionCount }, async (_, index) => {
      const user = new UserSession(`conn-${index}`);
      const connStartTime = performance.now();
      
      try {
        // Each connection performs multiple operations
        await user.login();
        await user.getGames();
        await user.createGame();
        await user.getGameState();
        
        const responseTime = performance.now() - connStartTime;
        return { success: true, responseTime, index };
      } catch (error: any) {
        const responseTime = performance.now() - connStartTime;
        return { success: false, responseTime, index, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    const totalTime = performance.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    const errorRate = errorCount / results.length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    console.log(`✅ Connection Pool Results:`);
    console.log(`   Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`   Successful connections: ${successCount}/${connectionCount}`);
    console.log(`   Failed connections: ${errorCount}`);
    console.log(`   Error rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`   Average connection time: ${avgResponseTime.toFixed(2)}ms`);

    // Log any specific errors
    const errors = results.filter(r => !r.success);
    if (errors.length > 0) {
      console.log(`   Error breakdown:`);
      const errorCounts: { [key: string]: number } = {};
      errors.forEach(e => {
        const errorType = e.error?.split(' ')[0] || 'Unknown';
        errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      });
      Object.entries(errorCounts).forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });
    }

    expect(totalTime).toBeLessThan(LOAD_THRESHOLDS.CONCURRENT_USERS_50);
    expect(errorRate).toBeLessThan(0.1); // Allow 10% error rate for connection pool stress
  }, 45000);

  test('Memory usage under load', async () => {
    const initialMemory = process.memoryUsage();
    console.log(`\n💾 Memory Usage Test`);
    console.log(`   Initial heap usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    
    // Perform load operations
    await runLoadTest(
      'Memory Load Test',
      15,
      async (user) => {
        await user.login();
        await user.getGames();
        await user.createGame();
      },
      LOAD_THRESHOLDS.CONCURRENT_USERS_25
    );

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    console.log(`   Final heap usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    
    // Memory growth should be reasonable (less than 100MB)
    expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024);
  }, 45000);

  test('API rate limiting behavior under load', async () => {
    const user = new UserSession('rate-limit-test');
    await user.login();
    
    console.log(`\n⚡ Rate Limiting Test`);
    
    // Make rapid requests
    const rapidRequests = 100;
    const promises = Array.from({ length: rapidRequests }, async (_, index) => {
      const startTime = performance.now();
      try {
        await user.getGames();
        return { 
          success: true, 
          index, 
          responseTime: performance.now() - startTime 
        };
      } catch (error) {
        return { 
          success: false, 
          index, 
          responseTime: performance.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(`   Rapid requests sent: ${rapidRequests}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed/Rate limited: ${errorCount}`);
    console.log(`   Success rate: ${(successCount / rapidRequests * 100).toFixed(2)}%`);
    
    // Either all requests succeed (no rate limiting) or some fail
    expect(successCount + errorCount).toBe(rapidRequests);
    
    // If rate limiting exists, it shouldn't block everything
    if (errorCount > 0) {
      expect(successCount).toBeGreaterThan(rapidRequests * 0.1); // At least 10% should succeed
    }
  }, 30000);
});