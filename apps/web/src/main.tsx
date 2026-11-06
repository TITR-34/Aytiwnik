import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth';
import App from './App';
import './index.css';
import { envOk } from './lib/supabase';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

const Missing = () => (
  <div className="mx-auto max-w-lg p-8">
    <div className="card space-y-2">
      <h1 className="text-xl font-bold">.env faylı doldurulmayıb</h1>
      <p className="text-sm text-muted">Layihənin ən üst qovluğunda <code>.env.example</code> faylını <code>.env</code> adı ilə köçürün, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY və VITE_API_URL dəyərlərini yazın, sonra <code>npm run dev:web</code> əmrini yenidən başladın.</p>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  !envOk ? <Missing /> : (
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
  ),
);
