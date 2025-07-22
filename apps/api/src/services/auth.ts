import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database.js';
import { generateTokens } from '../utils/jwt.js';

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    username: string;
    elo: number;
    gamesPlayed: number;
    gamesWon: number;
    createdAt: Date;
  };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export interface RegisterResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    username: string;
    elo: number;
    gamesPlayed: number;
    gamesWon: number;
    createdAt: Date;
  };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Authentication service
 */
export class AuthService {
  /**
   * Register a new user
   */
  public async register(email: string, username: string, password: string): Promise<RegisterResult> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { username },
          ],
        },
      });

      if (existingUser) {
        return {
          success: false,
          error: existingUser.email === email 
            ? 'Email already registered' 
            : 'Username already taken',
        };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          username: true,
          elo: true,
          gamesPlayed: true,
          gamesWon: true,
          createdAt: true,
        },
      });

      // Generate tokens
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      // Record initial ELO
      await prisma.eloHistory.create({
        data: {
          userId: user.id,
          elo: 1200,
          change: 0,
        },
      });

      return {
        success: true,
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed',
      };
    }
  }

  /**
   * Login user
   */
  public async login(email: string, password: string): Promise<LoginResult> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Generate tokens
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;

      return {
        success: true,
        user: userWithoutPassword,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed',
      };
    }
  }

  /**
   * Validate user credentials for Socket.io authentication
   */
  public async validateUser(userId: string): Promise<{ valid: boolean; user?: any }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          elo: true,
          gamesPlayed: true,
          gamesWon: true,
          createdAt: true,
        },
      });

      if (!user) {
        return { valid: false };
      }

      return { valid: true, user };
    } catch (error) {
      console.error('User validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Change user password
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }
}