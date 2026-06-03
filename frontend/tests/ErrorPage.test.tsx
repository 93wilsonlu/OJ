import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ErrorPage from '../src/pages/ErrorPage';

// Mock react-router-dom navigate
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate,
  };
});

describe('ErrorPage', () => {
  // Store the original window.location to restore it later
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  afterEach(() => {
    // Restore window.location after tests to prevent side effects
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  const renderComponent = (props = {}) => {
    return render(
      <MemoryRouter>
        <ErrorPage {...props} />
      </MemoryRouter>
    );
  };

  it('1. should render default 500 server error when no props are provided', () => {
    renderComponent();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong on our end. Please try again.')).toBeInTheDocument();
  });

  it('2. should render specific status code and copy (e.g. 403)', () => {
    renderComponent({ status: 403 });
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view this page.")).toBeInTheDocument();
  });

  it('3. should override default detail when custom message is provided', () => {
    renderComponent({ status: 403, message: 'Custom forbidden message' });
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText('Custom forbidden message')).toBeInTheDocument();
  });

  it('4. should render ERR and network error copy when status is 0', () => {
    renderComponent({ status: 0 });
    // Because 0 is falsy, `status || 'ERR'` evaluates to 'ERR'
    expect(screen.getByText('ERR')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Could not reach the server. Check your connection.')).toBeInTheDocument();
  });

  it('5. should fallback to 500 copy for unmapped status codes', () => {
    renderComponent({ status: 418 }); // 418 is not in STATUS_COPY
    expect(screen.getByText('418')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument(); 
  });

  it('6. should call navigate(-1) when "Go back" button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const goBackBtn = screen.getByRole('button', { name: 'Go back' });
    await user.click(goBackBtn);
    
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('7. should call window.location.reload() when "Retry" button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryBtn);
    
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});