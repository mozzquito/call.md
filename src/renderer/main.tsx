import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTrpcClient, getApiPort } from './api/trpc';
import { useConfigStore } from './stores/config.store';
import { initializeTheme } from './stores/theme.store';
import { App } from './App';
import './styles/globals.css';

const cleanupTheme = initializeTheme();
window.addEventListener('beforeunload', cleanupTheme, { once: true });

function TrpcProvider({ children, port }: { children: React.ReactNode; port: number }) {
  const configStore = useConfigStore();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    createTrpcClient(() => useConfigStore.getState().accessToken, port)
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

function Root() {
  const [port, setPort] = useState<number | null>(null);

  useEffect(() => {
    getApiPort().then(setPort);
  }, []);

  if (port === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Connecting...</p>
      </div>
    );
  }

  return (
    <TrpcProvider port={port}>
      <App />
    </TrpcProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
