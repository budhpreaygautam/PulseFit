import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import './index.css';

// Pages have their own error panel (App.tsx). This catches the rest (header, footer, dialogs), so
// a crash there still leaves a way back instead of an empty page.
const AppCrashed: React.FC = () => (
  <main className="min-h-screen flex items-center justify-center bg-gym-950 px-6 text-center text-slate-100">
    <div className="max-w-md">
      <h1 className="text-2xl font-black font-['Outfit']">Something went wrong</h1>
      <p className="mt-3 text-sm text-slate-400">PulseFit hit a problem it couldn't recover from. Reloading the page usually fixes it.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-6 neu-btn-lime px-6 py-3 rounded-xl font-bold text-sm">
        Reload page
      </button>
    </div>
  </main>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<AppCrashed />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
