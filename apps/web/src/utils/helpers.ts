import { Card, Suit, Rank } from '@gin-rummy/common';
import { CARD_SUITS } from './constants';

/**
 * Get the display symbol for a card suit
 */
export function getSuitSymbol(suit: Suit): string {
  const suitData = CARD_SUITS.find(s => s.suit === suit);
  return suitData?.symbol || '';
}

/**
 * Get the color class for a card suit
 */
export function getSuitColor(suit: Suit): 'red' | 'black' {
  const suitData = CARD_SUITS.find(s => s.suit === suit);
  return suitData?.color as 'red' | 'black' || 'black';
}

/**
 * Format a card for display
 */
export function formatCard(card: Card): { display: string; symbol: string; color: string } {
  return {
    display: card.rank === Rank.Ten ? '10' : card.rank,
    symbol: getSuitSymbol(card.suit),
    color: getSuitColor(card.suit),
  };
}

/**
 * Format time duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format large numbers with abbreviations (1.2K, 1.5M, etc.)
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Format date to relative time (2 hours ago, 3 days ago, etc.)
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const targetDate = new Date(date);
  const diffMs = now.getTime() - targetDate.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return targetDate.toLocaleDateString();
  }
}

/**
 * Calculate win rate percentage
 */
export function calculateWinRate(gamesWon: number, gamesPlayed: number): number {
  if (gamesPlayed === 0) return 0;
  return Math.round((gamesWon / gamesPlayed) * 100);
}

/**
 * Get ELO rating color based on rating
 */
export function getEloColor(elo: number): string {
  if (elo >= 1600) return 'text-purple-600';
  if (elo >= 1400) return 'text-blue-600';
  if (elo >= 1200) return 'text-green-600';
  if (elo >= 1000) return 'text-yellow-600';
  return 'text-gray-600';
}

/**
 * Get ELO rating rank name
 */
export function getEloRank(elo: number): string {
  if (elo >= 1600) return 'Master';
  if (elo >= 1400) return 'Expert';
  if (elo >= 1200) return 'Advanced';
  if (elo >= 1000) return 'Intermediate';
  return 'Beginner';
}

/**
 * Debounce function for limiting API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Combine CSS class names conditionally
 */
export function clsx(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Check if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Scroll element into view smoothly
 */
export function scrollToElement(element: HTMLElement | null, offset = 0): void {
  if (!element) return;
  
  const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
  const offsetPosition = elementPosition - offset;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth',
  });
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  return window.innerWidth <= 768;
}

/**
 * Get device pixel ratio for high-DPI displays
 */
export function getDevicePixelRatio(): number {
  return window.devicePixelRatio || 1;
}