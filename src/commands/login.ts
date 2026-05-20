import http from 'http';
import { getApiUrl, saveConfig } from '../config.js';

export async function loginCommand(options: { api?: string }) {
  const apiUrl = options.api || getApiUrl();
  const { default: open } = await import('open');
  const { default: ora } = await import('ora');

  const spinner = ora('Waiting for browser login...').start();

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const jwt = url.searchParams.get('jwt');
      const refreshToken = url.searchParams.get('refreshToken');

      if (!jwt || !refreshToken) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Login failed</h1><p>Missing tokens. You can close this tab.</p>');
        spinner.fail('Login failed: missing tokens');
        server.close();
        reject(new Error('Missing tokens'));
        return;
      }

      saveConfig({ apiUrl, jwt, refreshToken });

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Login successful!</h1><p>You can close this tab and return to the terminal.</p>');
      spinner.succeed('Logged in successfully');
      server.close();
      resolve();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const authUrl = `${apiUrl}/auth/github?state=cli:${port}`;
      spinner.text = `Opening browser... (port ${port})`;
      open(authUrl).catch(() => {
        spinner.info(`Open this URL in your browser:\n  ${authUrl}`);
      });
    });

    const timeout = setTimeout(() => {
      spinner.fail('Login timed out (60s)');
      server.close();
      reject(new Error('Timeout'));
    }, 60000);
    timeout.unref();
  });
}
