# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in ICE, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Email **julia@light-cloud.com** with a description of the vulnerability.
3. Include steps to reproduce, impact assessment, and any suggested fixes.

We aim to respond within 48 hours and provide a fix within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Measures

- All secrets (JWT, encryption keys) are required via environment variables with no defaults
- Credentials are encrypted at rest using AES-256-GCM
- JWT tokens expire after 1 hour with refresh token rotation
- HMAC verification on all webhooks
- Rate limiting on all API endpoints
- CORS restricted to configured origins
- Helmet.js security headers enabled
