import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Aurum — Portfolio intelligence',
  description:
    'A private-ready, read-only portfolio dashboard with transparent data provenance.',
  openGraph: {
    title: 'Aurum',
    description: 'Portfolio intelligence, without the noise',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Aurum' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurum',
    description: 'Portfolio intelligence, without the noise',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
