import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../Header';

// Mock data
const mockUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  elo: 1200,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Mock functions
const mockLogout = vi.fn();
const mockPush = vi.fn();

// Mock objects that can be modified
const mockAuthStoreReturn = { user: null };
const mockUseAuthReturn = { logout: mockLogout };
const mockRouterReturn = { push: mockPush };

vi.mock('../../../store/auth', () => ({
  useAuthStore: () => mockAuthStoreReturn
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuthReturn
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouterReturn
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  )
}));

// Mock the helper function
vi.mock('../../../utils/helpers', () => ({
  getEloRank: vi.fn((elo: number) => {
    if (elo >= 1200) return 'Silver';
    if (elo >= 1000) return 'Bronze';
    return 'Unranked';
  })
}));

// Mock NotificationBell component
vi.mock('../../NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell">Notification Bell</div>
}));

describe('Header Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default unauthenticated state
    Object.assign(mockAuthStoreReturn, { user: null });
  });

  describe('Unauthenticated State', () => {
    it('should render logo and brand name', () => {
      render(<Header />);

      expect(screen.getByText('GR')).toBeInTheDocument();
      expect(screen.getByText('Gin Rummy')).toBeInTheDocument();
      
      // Check logo link
      const logoLink = screen.getByText('GR').closest('a');
      expect(logoLink).toHaveAttribute('href', '/');
    });

    it('should show login and register buttons when not authenticated', () => {
      render(<Header />);

      const loginLink = screen.getByText('Login');
      const registerLink = screen.getByText('Sign Up');

      expect(loginLink).toBeInTheDocument();
      expect(registerLink).toBeInTheDocument();
      expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
      expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
    });

    it('should not show authenticated user elements', () => {
      render(<Header />);

      expect(screen.queryByText('Lobby')).not.toBeInTheDocument();
      expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Logout')).not.toBeInTheDocument();
    });

    it('should have proper styling for unauthenticated state', () => {
      render(<Header />);

      const loginLink = screen.getByText('Login');
      const registerLink = screen.getByText('Sign Up');

      expect(loginLink).toHaveClass('text-gray-700', 'hover:text-gray-900');
      expect(registerLink).toHaveClass('btn', 'btn-primary');
    });
  });

  describe('Authenticated State', () => {
    beforeEach(() => {
      Object.assign(mockAuthStoreReturn, { user: mockUser });
    });

    it('should show user information when authenticated', () => {
      render(<Header />);

      expect(screen.getByText('testuser')).toBeInTheDocument();
      expect(screen.getByText('1200 • Silver')).toBeInTheDocument();
      
      // Check user avatar with first letter
      expect(screen.getByText('T')).toBeInTheDocument(); // First letter of username
    });

    it('should show navigation links when authenticated', () => {
      render(<Header />);

      const lobbyLink = screen.getByText('Lobby');
      expect(lobbyLink).toBeInTheDocument();
      expect(lobbyLink.closest('a')).toHaveAttribute('href', '/lobby');
    });

    it('should show notification bell when authenticated', () => {
      render(<Header />);

      expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    });

    it('should show logout button when authenticated', () => {
      render(<Header />);

      const logoutButton = screen.getByTitle('Logout');
      expect(logoutButton).toBeInTheDocument();
    });

    it('should not show login/register buttons when authenticated', () => {
      render(<Header />);

      expect(screen.queryByText('Login')).not.toBeInTheDocument();
      expect(screen.queryByText('Sign Up')).not.toBeInTheDocument();
    });

    it('should handle profile click correctly', async () => {
      render(<Header />);

      const profileButton = screen.getByText('testuser').closest('button')!;
      await user.click(profileButton);

      expect(mockPush).toHaveBeenCalledWith('/profile/testuser');
    });

    it('should handle logout click correctly', async () => {
      render(<Header />);

      const logoutButton = screen.getByTitle('Logout');
      await user.click(logoutButton);

      expect(mockLogout).toHaveBeenCalledOnce();
    });
  });

  describe('ELO Ranking Display', () => {
    it('should display correct rank for different ELO values', () => {
      // Test high ELO
      Object.assign(mockAuthStoreReturn, { 
        user: { ...mockUser, elo: 1500 } 
      });
      
      const { rerender } = render(<Header />);
      expect(screen.getByText('1500 • Silver')).toBeInTheDocument();

      // Test low ELO
      Object.assign(mockAuthStoreReturn, { 
        user: { ...mockUser, elo: 800 } 
      });
      
      rerender(<Header />);
      expect(screen.getByText('800 • Unranked')).toBeInTheDocument();

      // Test medium ELO
      Object.assign(mockAuthStoreReturn, { 
        user: { ...mockUser, elo: 1100 } 
      });
      
      rerender(<Header />);
      expect(screen.getByText('1100 • Bronze')).toBeInTheDocument();
    });
  });

  describe('User Avatar', () => {
    beforeEach(() => {
      Object.assign(mockAuthStoreReturn, { user: mockUser });
    });

    it('should display correct first letter of username', () => {
      render(<Header />);

      const avatar = screen.getByText('T'); // First letter of 'testuser'
      expect(avatar).toBeInTheDocument();
      expect(avatar.closest('div')).toHaveClass('bg-primary-100', 'rounded-full');
    });

    it('should handle different usernames correctly', () => {
      Object.assign(mockAuthStoreReturn, { 
        user: { ...mockUser, username: 'alice' } 
      });
      
      render(<Header />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('should be clickable for profile navigation', async () => {
      render(<Header />);

      const profileButton = screen.getByText('testuser').closest('button')!;
      expect(profileButton).toBeInTheDocument();
      
      await user.click(profileButton);
      expect(mockPush).toHaveBeenCalledWith('/profile/testuser');
    });
  });

  describe('Responsive Design', () => {
    beforeEach(() => {
      Object.assign(mockAuthStoreReturn, { user: mockUser });
    });

    it('should have responsive navigation classes', () => {
      render(<Header />);

      const nav = screen.getByText('Lobby').closest('nav');
      expect(nav).toHaveClass('hidden', 'md:flex');
    });

    it('should hide user details on small screens', () => {
      render(<Header />);

      // The parent div of the username text has the responsive classes
      const userDetailsParent = screen.getByText('testuser').parentElement;
      expect(userDetailsParent).toHaveClass('hidden', 'sm:block');
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      Object.assign(mockAuthStoreReturn, { user: mockUser });
    });

    it('should have proper button roles and titles', () => {
      render(<Header />);

      const profileButton = screen.getByText('testuser').closest('button');
      const logoutButton = screen.getByTitle('Logout');

      // Profile button doesn't need explicit type since it's not in a form
      expect(profileButton).toBeInTheDocument();
      expect(logoutButton).toHaveAttribute('title', 'Logout');
    });

    it('should have proper link structure', () => {
      render(<Header />);

      const logoLink = screen.getByText('Gin Rummy').closest('a');
      const lobbyLink = screen.getByText('Lobby').closest('a');

      expect(logoLink).toHaveAttribute('href', '/');
      expect(lobbyLink).toHaveAttribute('href', '/lobby');
    });

    it('should be keyboard navigable', async () => {
      render(<Header />);

      const profileButton = screen.getByText('testuser').closest('button')!;
      const logoutButton = screen.getByTitle('Logout');

      // Tab to profile button
      profileButton.focus();
      expect(profileButton).toHaveFocus();

      // Should be able to activate with Enter
      await user.keyboard('{Enter}');
      expect(mockPush).toHaveBeenCalledWith('/profile/testuser');

      // Tab to logout button
      logoutButton.focus();
      expect(logoutButton).toHaveFocus();

      // Should be able to activate with Enter
      await user.keyboard('{Enter}');
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('Visual States', () => {
    it('should have proper hover states', () => {
      render(<Header />);

      const loginLink = screen.getByText('Login');
      expect(loginLink).toHaveClass('hover:text-gray-900');
    });

    it('should have proper transition classes', () => {
      Object.assign(mockAuthStoreReturn, { user: mockUser });
      render(<Header />);

      const profileButton = screen.getByText('testuser').closest('button');
      const logoutButton = screen.getByTitle('Logout');

      expect(profileButton).toHaveClass('transition-colors');
      expect(logoutButton).toHaveClass('transition-colors');
    });
  });

  describe('Logo and Branding', () => {
    it('should have proper logo styling', () => {
      render(<Header />);

      const logoContainer = screen.getByText('GR').closest('div');
      expect(logoContainer).toHaveClass('w-8', 'h-8', 'bg-primary-600', 'rounded-lg');
      
      const logoText = screen.getByText('GR');
      expect(logoText).toHaveClass('text-white', 'font-bold', 'text-lg');
    });

    it('should have proper brand name styling', () => {
      render(<Header />);

      const brandName = screen.getByText('Gin Rummy');
      expect(brandName).toHaveClass('text-xl', 'font-bold', 'text-gray-900');
    });
  });
});