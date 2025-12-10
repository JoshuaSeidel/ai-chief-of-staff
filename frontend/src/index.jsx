import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';

// Prevent iOS Safari native pull-to-refresh
if (typeof document !== 'undefined') {
  // Check if we're in iOS PWA mode
  const isIOSPWA = window.matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true;

  if (isIOSPWA) {
    // Set overscroll-behavior on body to prevent native pull-to-refresh
    document.body.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehaviorY = 'none';
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Service worker is automatically registered by vite-plugin-pwa
