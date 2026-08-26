import { render, screen } from '@testing-library/react';
import { buildPublishableKey } from '@clerk/shared/keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInPage from '../../app/sign-in/[[...sign-in]]/page';
import { ClerkAuthBoundary } from '../../components/auth/ClerkAuthBoundary';

const clerk = vi.hoisted(() => ({
  ClerkProvider: vi.fn(({ children }: { children: React.ReactNode }) => <div data-testid="clerk-provider">{children}</div>),
  SignIn: vi.fn(() => <div data-testid="clerk-sign-in" />),
  UserButton: vi.fn(() => <div data-testid="clerk-user-button" />),
  useAuth: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const publicKey = buildPublishableKey('fixture.clerk.accounts.dev');

vi.mock('@clerk/react', () => clerk);
vi.mock('next/navigation', () => ({ usePathname: () => window.location.pathname, useRouter: () => router }));

vi.mock('../../components/app-shell/DashboardShell', () => ({
  DashboardShell: ({ children, userControl }: { children: React.ReactNode; userControl?: React.ReactNode }) => (
    <div data-testid="dashboard-shell"><div data-testid="user-control">{userControl}</div>{children}</div>
  ),
}));

describe('ClerkAuthBoundary', () => {
  beforeEach(() => {
    clerk.ClerkProvider.mockClear();
    clerk.SignIn.mockClear();
    clerk.UserButton.mockClear();
    router.push.mockClear();
    router.replace.mockClear();
  });
  it('keeps demo mode independent of Clerk and renders the dashboard shell', () => {
    render(
      <ClerkAuthBoundary apiBaseUrl="" mode="demo">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    );

    expect(screen.getByTestId('dashboard-shell')).toHaveTextContent('dashboard');
    expect(clerk.ClerkProvider).not.toHaveBeenCalled();
    expect(clerk.SignIn).not.toHaveBeenCalled();
  });

  it('fails closed for connected mode without a valid public Clerk configuration', () => {
    expect(() => render(
      <ClerkAuthBoundary apiBaseUrl="/api/aurum" mode="connected" publishableKey="invalid" redirectOrigin="https://portfolio.example.test">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    )).toThrow('Connected mode requires a valid Clerk publishable key');
  });

  it('shows an accessible loading state without shell content while Clerk initializes', async () => {
    clerk.useAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });
    render(
      <ClerkAuthBoundary apiBaseUrl="/api/aurum" mode="connected" publishableKey={publicKey} redirectOrigin="https://portfolio.example.test">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    );

    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
  });

  it('renders only the email-code sign-in screen for a signed-out sign-in route', async () => {
    clerk.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    window.history.replaceState({}, '', '/sign-in/email-code');
    render(
      <ClerkAuthBoundary apiBaseUrl="/api/aurum" mode="connected" publishableKey={publicKey} redirectOrigin="https://portfolio.example.test">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    );

    await screen.findByTestId('clerk-provider');
    expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
    expect(clerk.SignIn).toHaveBeenCalledWith(expect.objectContaining({
      path: '/sign-in', routing: 'path', transferable: false, withSignUp: false,
    }), undefined);
  });

  it('replaces a protected signed-out route with the sign-in route before showing a shell', async () => {
    clerk.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    window.history.replaceState({}, '', '/settings');
    render(
      <ClerkAuthBoundary apiBaseUrl="/api/aurum" mode="connected" publishableKey={publicKey} redirectOrigin="https://portfolio.example.test">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    );

    await screen.findByTestId('clerk-provider');
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
    expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
  });

  it('renders the shell and Clerk user control for a signed-in owner', async () => {
    clerk.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    window.history.replaceState({}, '', '/');
    render(
      <ClerkAuthBoundary apiBaseUrl="/api/aurum" mode="connected" nonce="request-nonce" publishableKey={publicKey} redirectOrigin="https://portfolio.example.test">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    );

    expect(await screen.findByTestId('dashboard-shell')).toHaveTextContent('dashboard');
    expect(screen.getByTestId('clerk-user-button')).toBeInTheDocument();
    expect(clerk.ClerkProvider).toHaveBeenCalledWith(expect.objectContaining({
      publishableKey: publicKey,
      signInUrl: '/sign-in', telemetry: false,
      nonce: 'request-nonce',
      allowedRedirectOrigins: ['https://portfolio.example.test'],
    }), undefined);
    const providerProps = clerk.ClerkProvider.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(providerProps).not.toHaveProperty('dynamic');
    (providerProps.routerPush as (to: string) => void)('/sign-in/email-code');
    (providerProps.routerReplace as (to: string) => void)('/');
    expect(router.push).toHaveBeenCalledWith('/sign-in/email-code');
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('replaces the sign-in route with the dashboard when an owner is already signed in', async () => {
    clerk.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    window.history.replaceState({}, '', '/sign-in');
    render(
      <ClerkAuthBoundary apiBaseUrl="/api/aurum" mode="connected" publishableKey={publicKey} redirectOrigin="https://portfolio.example.test">
        <main>dashboard</main>
      </ClerkAuthBoundary>,
    );

    await screen.findByTestId('clerk-provider');
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
  });

  it('uses the optional catch-all sign-in page without a dashboard shell', () => {
    const { container } = render(<SignInPage />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
  });
});
