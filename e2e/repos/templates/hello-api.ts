/** Minimal Express.js API — for Cloud Run testing */
export function helloApiFiles(): Array<{ path: string; content: string }> {
  return [
    {
      path: 'index.js',
      content: `const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (_req, res) => res.json({ status: 'ok', service: 'ice-test-hello-api' }));
app.get('/health', (_req, res) => res.sendStatus(200));

app.listen(PORT, () => console.log(\`Listening on port \${PORT}\`));
`,
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: 'ice-test-hello-api',
          version: '1.0.0',
          main: 'index.js',
          scripts: { start: 'node index.js' },
          dependencies: { express: '^4.21.0' },
        },
        null,
        2,
      ),
    },
    {
      path: 'Dockerfile',
      content: `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
`,
    },
  ];
}
