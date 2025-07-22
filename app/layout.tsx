import type { Metadata } from 'next';
import '../src/index.css';
import Header from '../src/components/layout/Header';
import AuthProvider from '../src/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Gin Rummy',
  description: 'Multiplayer Gin Rummy game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <AuthProvider>
          <Header />
          <main>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}