import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect } from 'vitest';
import NotFound from '../src/pages/NotFound';

describe('NotFound Page', () => {
  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
  };

  test('renders 404 status and error messages', () => {
    renderComponent();

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByText("The route you requested doesn't exist.")).toBeInTheDocument();
  });

  test('renders a link to go back home', () => {
    renderComponent();

    const homeLink = screen.getByRole('link', { name: 'Go home' });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });
});