import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

// Mock the useAuth hook
const mockLogin = vi.fn();
const mockClearError = vi.fn();

// Create the mock function that will be used in vi.mock
const mockUseAuthReturn = {
  login: mockLogin,
  loading: false,
  error: null,
  clearError: mockClearError,
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuthReturn
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  )
}));

describe('Login Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default state
    Object.assign(mockUseAuthReturn, {
      login: mockLogin,
      loading: false,
      error: null,
      clearError: mockClearError,
    });
  });

  describe('Basic Rendering', () => {
    it('should render login form with all required elements', () => {
      render(<Login />);

      // Check title and branding
      expect(screen.getByText('GR')).toBeInTheDocument();
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
      
      // Check form fields
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      
      // Check submit button
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      
      // Check register link
      const registerLink = screen.getByText('create a new account');
      expect(registerLink).toBeInTheDocument();
      expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
    });

    it('should have proper form field attributes', () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('name', 'email');
      expect(emailInput).toHaveAttribute('autoComplete', 'email');
      expect(emailInput).toBeRequired();

      const passwordInput = screen.getByLabelText('Password');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('name', 'password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
      expect(passwordInput).toBeRequired();
    });
  });

  describe('Form Interaction', () => {
    it('should update form fields when user types', async () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address') as HTMLInputElement;
      const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      expect(emailInput.value).toBe('test@example.com');
      expect(passwordInput.value).toBe('password123');
    });

    it('should call login function when form is submitted', async () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should call login function when form is submitted with Enter key', async () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      const passwordInput = screen.getByLabelText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.keyboard('{Enter}');

      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should clear error when user starts typing', async () => {
      // Mock useAuth with an error
      Object.assign(mockUseAuthReturn, {
        error: 'Invalid credentials',
      });

      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 't');

      expect(mockClearError).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when present', () => {
      // Mock useAuth with an error
      Object.assign(mockUseAuthReturn, {
        error: 'Invalid email or password',
      });

      render(<Login />);

      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      
      // Check error styling
      const errorDiv = screen.getByText('Invalid email or password').closest('div');
      expect(errorDiv).toHaveClass('bg-red-50', 'border-red-200', 'text-red-700');
    });

    it('should not display error message when no error', () => {
      render(<Login />);

      // No error message should be present
      expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should disable form and show loading state when submitting', () => {
      // Mock useAuth with loading state
      Object.assign(mockUseAuthReturn, {
        loading: true,
      });

      render(<Login />);

      const submitButton = screen.getByRole('button', { name: /signing in/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Form Validation', () => {
    it('should prevent submission with empty fields', async () => {
      render(<Login />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      // Form should not submit if required fields are empty
      // The browser's built-in validation will prevent submission
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should require valid email format', async () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 'invalid-email');

      // Check that input has invalid state
      expect(emailInput).toBeInvalid();
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels and form structure', () => {
      render(<Login />);

      // Check form exists by selecting it directly
      const form = screen.getByRole('button', { name: /sign in/i }).closest('form');
      expect(form).toBeInTheDocument();

      // Check labels are properly associated
      const emailInput = screen.getByLabelText('Email address');
      const passwordInput = screen.getByLabelText('Password');
      
      expect(emailInput).toBeInTheDocument();
      expect(passwordInput).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      render(<Login />);

      const mainHeading = screen.getByRole('heading', { level: 2 });
      expect(mainHeading).toHaveTextContent('Sign in to your account');
    });

    it('should be keyboard navigable', async () => {
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Focus the first input directly
      emailInput.focus();
      expect(emailInput).toHaveFocus();

      // Tab through form elements
      await user.tab();
      expect(passwordInput).toHaveFocus();

      await user.tab();
      expect(submitButton).toHaveFocus();
    });
  });

  describe('Navigation', () => {
    it('should have working register link', () => {
      render(<Login />);

      const registerLink = screen.getByText('create a new account');
      expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
    });

    it('should have proper link styling', () => {
      render(<Login />);

      const registerLink = screen.getByText('create a new account');
      expect(registerLink).toHaveClass('text-primary-600', 'hover:text-primary-500', 'font-medium');
    });
  });
});