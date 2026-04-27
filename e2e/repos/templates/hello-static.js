/** Minimal static site — for Cloud Storage / CDN testing */
export function helloStaticFiles() {
    return [
        {
            path: 'index.html',
            content: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>ICE Test</title></head>
<body><h1>Hello from ICE Test</h1><p>Static site deployed by ICE template test suite.</p></body>
</html>
`,
        },
        {
            path: 'Dockerfile',
            content: `FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 8080
`,
        },
        {
            path: 'nginx.conf',
            content: `server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
`,
        },
    ];
}
