/**
 * Event-Sourced System Logger
 * 
 * Comprehensive logging and monitoring for the event-sourced architecture.
 * Provides structured logging, performance metrics, and debugging capabilities.
 */

export interface LogContext {
  gameId?: string;
  userId?: string;
  eventType?: string;
  sequenceNumber?: number;
  component?: string;
  operation?: string;
  metadata?: Record<string, any>;
  
  // Performance tracking
  timerId?: string;
  performanceMs?: number;
  
  // State transitions  
  transition?: string | object;
  fromStatus?: string;
  
  // HTTP methods
  method?: string;
  
  // Repair system
  eventCount?: number;
  issues?: string[];
  repairsApplied?: string[];
  totalGames?: number;
  validatedGames?: number;
  
  // Additional event logger properties  
  startTime?: number;
  endTime?: string;
  toStatus?: string;
  endpoint?: string;
  statusCode?: number;
  repairedGames?: number;
  durationMs?: number;
  failedGames?: number;
  repairs?: string[];
}

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  operation: string;
  context: LogContext;
}

export class EventLogger {
  private metrics = new Map<string, PerformanceMetrics>();
  
  /**
   * Log info message with context
   */
  info(message: string, context: LogContext = {}): void {
    this.log('INFO', message, context);
  }

  /**
   * Log warning message with context
   */
  warn(message: string, context: LogContext = {}): void {
    this.log('WARN', message, context);
  }

  /**
   * Log error message with context
   */
  error(message: string, error?: Error, context: LogContext = {}): void {
    const errorContext = error ? {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    } : context;
    
    this.log('ERROR', message, errorContext);
  }

  /**
   * Log debug message with context (only in development)
   */
  debug(message: string, context: LogContext = {}): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('DEBUG', message, context);
    }
  }

  /**
   * Start performance measurement
   */
  startTimer(operation: string, context: LogContext = {}): string {
    const timerId = `${operation}_${Date.now()}_${Math.random()}`;
    this.metrics.set(timerId, {
      startTime: Date.now(),
      operation,
      context
    });
    return timerId;
  }

  /**
   * End performance measurement and log results
   */
  endTimer(timerId: string): void {
    const metric = this.metrics.get(timerId);
    if (!metric) {
      this.warn('Timer not found', { timerId });
      return;
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;

    this.info(`${metric.operation} completed`, {
      ...metric.context,
      performanceMs: metric.duration,
      startTime: metric.startTime,
      endTime: new Date(metric.endTime).toISOString(),
    });

    // Clean up
    this.metrics.delete(timerId);

    // Alert on slow operations
    if (metric.duration > 5000) { // 5+ seconds
      this.warn(`Slow operation detected: ${metric.operation}`, {
        ...metric.context,
        performanceMs: metric.duration,
      });
    }
  }

  /**
   * Log event processing details
   */
  logEvent(phase: 'START' | 'SUCCESS' | 'FAILURE', eventType: string, context: LogContext): void {
    const prefix = {
      START: '🔄',
      SUCCESS: '✅', 
      FAILURE: '❌'
    }[phase];

    const message = `${prefix} Event ${phase.toLowerCase()}: ${eventType}`;
    
    if (phase === 'FAILURE') {
      this.error(message, undefined, context);
    } else {
      this.info(message, context);
    }
  }

  /**
   * Log game state transitions
   */
  logStateTransition(gameId: string, fromState: any, toState: any, eventType: string): void {
    this.info('🎮 Game state transition', {
      gameId,
      eventType,
      transition: {
        from: {
          phase: fromState?.phase,
          currentPlayer: fromState?.currentPlayerId,
          status: fromState?.status,
        },
        to: {
          phase: toState?.phase,
          currentPlayer: toState?.currentPlayerId,
          status: toState?.status,
        }
      }
    });

    // Alert on unexpected transitions
    if (fromState?.status === 'FINISHED' && toState?.status !== 'FINISHED') {
      this.warn('Unexpected transition from finished game', {
        gameId,
        eventType,
        fromStatus: fromState?.status,
        toStatus: toState?.status,
      });
    }
  }

  /**
   * Log AI processing details
   */
  logAI(phase: 'QUEUE' | 'START' | 'THINKING' | 'ACTION' | 'SUCCESS' | 'FAILURE', gameId: string, details: any = {}): void {
    const prefixes = {
      QUEUE: '🤖',
      START: '🚀',
      THINKING: '🧠',
      ACTION: '⚡',
      SUCCESS: '✅',
      FAILURE: '❌'
    };

    const message = `${prefixes[phase]} AI ${phase.toLowerCase()}: ${gameId}`;
    
    if (phase === 'FAILURE') {
      this.error(message, undefined, { gameId, component: 'AI', ...details });
    } else {
      this.info(message, { gameId, component: 'AI', ...details });
    }
  }

  /**
   * Log database operations
   */
  logDatabase(operation: string, result: 'SUCCESS' | 'FAILURE', details: any = {}): void {
    const prefix = result === 'SUCCESS' ? '💾' : '❌';
    const message = `${prefix} Database ${operation}: ${result}`;
    
    if (result === 'FAILURE') {
      this.error(message, undefined, { component: 'Database', operation, ...details });
    } else {
      this.debug(message, { component: 'Database', operation, ...details });
    }
  }

  /**
   * Log API endpoint access
   */
  logAPI(method: string, endpoint: string, statusCode: number, duration: number, context: LogContext = {}): void {
    const prefix = statusCode >= 400 ? '❌' : statusCode >= 300 ? '⚠️' : '✅';
    const message = `${prefix} ${method} ${endpoint} ${statusCode} (${duration}ms)`;
    
    const logLevel = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
    
    if (logLevel === 'error') {
      this.error(message, undefined, {
        component: 'API',
        method,
        endpoint,
        statusCode,
        durationMs: duration,
        ...context
      });
    } else if (logLevel === 'warn') {
      this.warn(message, {
        component: 'API',
        method,
        endpoint,
        statusCode,
        durationMs: duration,
        ...context
      });
    } else {
      this.info(message, {
        component: 'API',
        method,
        endpoint,
        statusCode,
        durationMs: duration,
        ...context
      });
    }
  }

  /**
   * Log game events for analysis and debugging
   */
  logGameEvent(gameId: string, eventType: string, details: any = {}): void {
    this.info('🎮 Game event logged', {
      gameId,
      eventType,
      component: 'GameEngine',
      ...details
    });
  }

  /**
   * Core logging function with structured output
   */
  private log(level: string, message: string, context: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context
    };

    // Console output with colors in development
    if (process.env.NODE_ENV === 'development') {
      const colors = {
        ERROR: '\x1b[31m', // Red
        WARN: '\x1b[33m',  // Yellow  
        INFO: '\x1b[36m',  // Cyan
        DEBUG: '\x1b[90m', // Gray
      };
      const reset = '\x1b[0m';
      const color = colors[level as keyof typeof colors] || '';
      
      console.log(`${color}[${timestamp}] ${level}: ${message}${reset}`, 
        Object.keys(context).length > 0 ? context : '');
    } else {
      // Production: structured JSON logs
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Get current metrics for monitoring
   */
  getMetrics(): {
    activeTimers: number;
    operations: string[];
  } {
    return {
      activeTimers: this.metrics.size,
      operations: Array.from(this.metrics.values()).map(m => m.operation)
    };
  }
}

// Singleton logger instance
export const eventLogger = new EventLogger();

// Convenience functions for common logging patterns
export const logEvent = eventLogger.logEvent.bind(eventLogger);
export const logStateTransition = eventLogger.logStateTransition.bind(eventLogger);
export const logAI = eventLogger.logAI.bind(eventLogger);
export const logDatabase = eventLogger.logDatabase.bind(eventLogger);
export const logAPI = eventLogger.logAPI.bind(eventLogger);
export const logGameEvent = eventLogger.logGameEvent.bind(eventLogger);