import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { setAuthToken } from './api/client';
import AuthProvider from './context/AuthProvider';
import { readStoredToken } from './utils/tokenStorage';
import './index.css';

// The stored token is attached before the first render: the auth provider
// verifies it asynchronously, and anything a page fetches in the meantime
// (owner-only fields such as `isOwner`, a private dashboard list) would
// otherwise go out anonymously and come back as if the user were a visitor.
// A token the API no longer accepts is cleared by the provider, so this can
// only ever add credentials to a request, never remove them from the session.
setAuthToken(readStoredToken());

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
