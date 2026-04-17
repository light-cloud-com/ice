import type { InfoContent } from '../_shared/types';

export const apiGatewayInfo: InfoContent = {
  overview: {
    markdown: `
# API Gateway

A managed front door for your APIs. Handles HTTPS, routing, throttling,
authentication, API key management, and usage metering — so your backend
services don't have to.

## When to use

- Multiple backends behind one public URL
- Rate limiting, API keys, usage plans
- Request/response transformation at the edge
- WebSocket APIs

## vs Custom Domain

**Custom Domain** gives you HTTPS + hostname in front of a single service.
**API Gateway** is heavier — full API management with routes, throttling,
and authorizers. Use API Gateway when you have real API-management needs;
otherwise Custom Domain is simpler and cheaper.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'API Gateway REST API', type: 'aws_api_gateway_rest_api' },
      { name: 'Stage', type: 'aws_api_gateway_stage' },
      { name: 'Deployment', type: 'aws_api_gateway_deployment' },
    ],
    gcp: [{ name: 'API Gateway', type: 'google_api_gateway_gateway' }],
    azure: [{ name: 'API Management', type: 'azurerm_api_management' }],
  },
  relatedConcepts: ['Network.CustomDomain', 'Compute.Container', 'Compute.ServerlessFunction'],
};
