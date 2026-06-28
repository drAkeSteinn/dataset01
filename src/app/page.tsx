'use client';

import dynamic from 'next/dynamic';
import { Providers } from '@/components/providers';

// Dynamic import with ssr: false to prevent hydration mismatch
// caused by react-resizable-panels generating random IDs on server vs client
const AppShell = dynamic(
  () => import('@/components/app-shell').then((mod) => mod.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-emerald-500" />
          <p className="text-sm text-muted-foreground">Loading Dataset Manager...</p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
