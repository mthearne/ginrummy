import { test, expect } from 'vitest';
import { performance } from 'perf_hooks';

// API Performance Testing
describe('API Performance Tests', () => {
  const API_BASE_URL = 'http://localhost:3003';
  
  // Performance thresholds (in milliseconds) - More realistic for testing
  const PERFORMANCE_THRESHOLDS = {
    HEALTH_CHECK: 2000,    // Health endpoint (realistic for network)
    AUTHENTICATION: 3000,  // Auth operations can be slower due to bcrypt
    GAME_CREATION: 2000,   // Game creation 
    GAME_LISTING: 1500,    // Listing games
    GAME_STATE: 1000,      // Game state retrieval
    CONCURRENT_LOAD: 5000  // Concurrent operations threshold
  };

  // Helper function to measure API response time
  async function measureApiCall(
    url: string, 
    options: RequestInit = {},
    expectedStatus: number = 200
  ): Promise<{ responseTime: number; response: Response }> {
    const startTime = performance.now();
    
    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    
    expect(response.status).toBe(expectedStatus);
    
    return { responseTime, response };
  }

  // Helper to create authenticated headers
  async function getAuthHeaders(): Promise<{ Authorization: string }> {
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo1@example.com',
        password: 'password123'
      })
    });
    
    const loginData = await loginResponse.json();
    return { Authorization: `Bearer ${loginData.accessToken}` };
  }

  test('Health endpoint performance', async () => {
    const { responseTime } = await measureApiCall('/api/health');
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.HEALTH_CHECK);
    console.log(`Health check response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Authentication performance - Login', async () => {
    const { responseTime } = await measureApiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'demo1@example.com',
        password: 'password123'
      })
    });
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.AUTHENTICATION);
    console.log(`Login response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Authentication performance - Token refresh', async () => {
    // First login to get tokens
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo1@example.com',
        password: 'password123'
      })
    });
    
    const loginData = await loginResponse.json();
    
    // Test refresh token performance
    const { responseTime } = await measureApiCall('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: loginData.refreshToken
      })
    });
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.AUTHENTICATION);
    console.log(`Token refresh response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Game creation performance', async () => {
    const authHeaders = await getAuthHeaders();
    
    const { responseTime } = await measureApiCall('/api/games', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        vsAI: true
      })
    }, 201);
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GAME_CREATION);
    console.log(`Game creation response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Game listing performance', async () => {
    const authHeaders = await getAuthHeaders();
    
    const { responseTime } = await measureApiCall('/api/games', {
      method: 'GET',
      headers: authHeaders
    });
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GAME_LISTING);
    console.log(`Game listing response time: ${responseTime.toFixed(2)}ms`);
  });

  test('User games listing performance', async () => {
    const authHeaders = await getAuthHeaders();
    
    const { responseTime } = await measureApiCall('/api/games/my-games', {
      method: 'GET',
      headers: authHeaders
    });
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GAME_LISTING);
    console.log(`User games listing response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Game state retrieval performance', async () => {
    const authHeaders = await getAuthHeaders();
    
    // Create a game first
    const gameResponse = await fetch(`${API_BASE_URL}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ vsAI: true })
    });
    
    const gameData = await gameResponse.json();
    
    // Test game state retrieval performance
    const { responseTime } = await measureApiCall(`/api/games/${gameData.game.id}/state`, {
      method: 'GET',
      headers: authHeaders
    });
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GAME_STATE);
    console.log(`Game state retrieval response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Concurrent API calls performance', async () => {
    const authHeaders = await getAuthHeaders();
    const concurrentRequests = 10;
    
    const startTime = performance.now();
    
    // Make multiple concurrent requests
    const promises = Array.from({ length: concurrentRequests }, () =>
      fetch(`${API_BASE_URL}/api/games`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      })
    );
    
    const responses = await Promise.all(promises);
    const endTime = performance.now();
    
    const totalTime = endTime - startTime;
    const averageTime = totalTime / concurrentRequests;
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // Total time for concurrent requests should be reasonable
    expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_LOAD);
    
    console.log(`${concurrentRequests} concurrent requests completed in ${totalTime.toFixed(2)}ms`);
    console.log(`Average response time: ${averageTime.toFixed(2)}ms`);
  });

  test('API error handling performance', async () => {
    // Test that error responses are also fast
    const { responseTime } = await measureApiCall('/api/nonexistent', {
      method: 'GET'
    }, 404);
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.HEALTH_CHECK);
    console.log(`404 error response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Large payload handling performance', async () => {
    const authHeaders = await getAuthHeaders();
    
    // Create a game and test game move with larger payload
    const gameResponse = await fetch(`${API_BASE_URL}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ vsAI: true })
    });
    
    const gameData = await gameResponse.json();
    
    // Test move submission performance (larger payload)
    const { responseTime } = await measureApiCall(`/api/games/${gameData.game.id}/move`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'draw',
        source: 'stock',
        metadata: {
          timestamp: Date.now(),
          clientId: 'test-client',
          additionalData: 'x'.repeat(1000) // Add some bulk to test payload handling
        }
      })
    });
    
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GAME_STATE);
    console.log(`Large payload move response time: ${responseTime.toFixed(2)}ms`);
  });

  test('Memory usage monitoring', async () => {
    const authHeaders = await getAuthHeaders();
    
    // Record initial memory usage
    const initialMemory = process.memoryUsage();
    
    // Perform multiple operations
    for (let i = 0; i < 20; i++) {
      await fetch(`${API_BASE_URL}/api/games`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Check final memory usage
    const finalMemory = process.memoryUsage();
    
    const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const heapGrowthMB = heapGrowth / 1024 / 1024;
    
    console.log(`Memory usage - Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Memory usage - Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Heap growth: ${heapGrowthMB.toFixed(2)}MB`);
    
    // Memory growth should be reasonable (less than 10MB for this test)
    expect(heapGrowthMB).toBeLessThan(10);
  });

  test('Rate limiting behavior', async () => {
    const authHeaders = await getAuthHeaders();
    const rapidRequests = 50;
    
    // Make rapid requests to test rate limiting
    const startTime = performance.now();
    
    const promises = Array.from({ length: rapidRequests }, async (_, index) => {
      const response = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });
      
      return {
        index,
        status: response.status,
        timestamp: performance.now() - startTime
      };
    });
    
    const results = await Promise.all(promises);
    
    // Analyze results
    const successfulRequests = results.filter(r => r.status === 200).length;
    const rateLimitedRequests = results.filter(r => r.status === 429).length;
    
    console.log(`Successful requests: ${successfulRequests}/${rapidRequests}`);
    console.log(`Rate limited requests: ${rateLimitedRequests}/${rapidRequests}`);
    
    // Either all requests succeed (no rate limiting) or some get rate limited
    expect(successfulRequests + rateLimitedRequests).toBe(rapidRequests);
    
    // If rate limiting is implemented, it should be reasonable
    if (rateLimitedRequests > 0) {
      expect(rateLimitedRequests).toBeLessThan(rapidRequests * 0.8); // No more than 80% rate limited
    }
  });
});