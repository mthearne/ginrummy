import { z } from 'zod';

export interface User {
  id: string;
  email: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  winRate: number;
  recentGames: GameHistory[];
  eloHistory: EloPoint[];
}

export interface GameHistory {
  id: string;
  opponent: string;
  result: 'win' | 'loss';
  score: number;
  opponentScore: number;
  duration: number;
  knockType: 'gin' | 'knock' | 'undercut';
  createdAt: string;
}

export interface EloPoint {
  elo: number;
  date: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be less than 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
});