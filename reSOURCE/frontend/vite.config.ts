import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * TEMPORARY diagnostics (dev only, removed once the sign-in problem is solved).
 * Prints, for every request that reaches this dev server, whether it carried an
 * Authorization header and what the API answered - so a token that is lost on
 * the way to the backend can be told apart from one the backend refuses.
 * Never prints the token itself.
 */
function traceApiTraffic(): Plugin {
  return {
    name: 'reSOURCE-trace-api-traffic',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        const isApi = url.startsWith('/api/');
        const isDocument = (req.headers.accept ?? '').includes('text/html');

        if (isApi || isDocument) {
          const auth = req.headers.authorization;
          const xauth = req.headers['x-auth-token'];
          // Header names only - never a value, so no token can end up in a log.
          console.log(`[trace]    headers: ${Object.keys(req.headers).sort().join(',')}`);
          console.log(
            `[trace] -> ${req.method} ${url}` +
              ` auth=${auth ? `yes(len:${String(auth).length})` : 'no'}` +
              ` xauth=${xauth ? `yes(len:${String(xauth).length})` : 'no'}` +
              ` ua="${(req.headers['user-agent'] ?? '').slice(0, 40)}"` +
              ` from=${req.socket.remoteAddress ?? '?'} ref="${(req.headers.referer ?? '').slice(0, 60)}"`,
          );
        }

        if (isApi) {
          const started = Date.now();
          res.on('finish', () => {
            console.log(`[trace] <- ${res.statusCode} ${req.method} ${url} ${Date.now() - started}ms`);
          });
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), traceApiTraffic()],
  server: {
    // Bound to all interfaces so the app can be reached from other devices.
    host: true,
    port: 5173,
    // Dev containers and preview proxies reach the server through a dynamic
    // host name, so host checking is disabled for the dev server.
    allowedHosts: true,
    // Used when VITE_API_BASE_URL is not set: same-origin `/api` calls are
    // forwarded to the Spring Boot backend.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          // The browser calls the API on the same origin it loaded the app
          // from, so the forwarded request must not look like a cross origin
          // call to the backend. Without this, `Origin` values such as a
          // preview or tunnel host are rejected by the API's CORS rules and
          // every POST (login, register, create) answers 403.
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
        },
      },
    },
  },
  // The same proxy for the production build served locally (`npm run build` +
  // `npx vite preview`). Serving the built app is lighter and steadier than the
  // dev server for repeated browser test runs, and the API path stays identical.
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
        },
      },
    },
  },
});
