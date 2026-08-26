import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { DashboardShell } from '../components/app-shell/DashboardShell';
import ConnectedAuthShell from '../components/auth/ConnectedAuthShell';
import { configuredDataMode } from '../lib/api/data-source';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Aurum — Portfolio intelligence', template: '%s · Aurum' },
  description: 'A private-ready, read-only portfolio dashboard with transparent data provenance.',
  openGraph: { title: 'Aurum', description: 'Portfolio intelligence, without the noise', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Aurum portfolio intelligence dashboard' }] },
  twitter: { card: 'summary_large_image', title: 'Aurum', description: 'Portfolio intelligence, without the noise', images: ['/og.png'] },
};

export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#090806' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = configuredDataMode();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {mode === 'demo' ? (
          <DashboardShell apiBaseUrl="" mode="demo">{children}</DashboardShell>
        ) : (
          <ConnectedAuthShell>{children}</ConnectedAuthShell>
        )}
      </body>
    </html>
  );
}
