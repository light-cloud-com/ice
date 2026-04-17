import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const serverlessFunctionInfo: InfoContent = {
  overview: {
    markdown: `
# Serverless Function

A short-lived function that runs in response to an event. Scales to zero when
idle (no cost), spins up on demand. Typical execution: under 30 seconds.

## When to use

- Webhook handlers (Stripe, GitHub, Slack)
- Image/video processing on upload
- Light API endpoints you don't want to keep warm
- Fan-out work from a queue or pub/sub

## When NOT to use

- Long-running requests (>60s) → **Scalable Backend** or **Worker**
- Continuous background processing → **Worker**
- Cold starts unacceptable → **Scalable Backend** with \`minInstances: 1\`

## Triggers

HTTP, pub/sub, object storage events, scheduled (cron), database changes.
Set via the \`trigger\` prop.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'Lambda Function', type: 'aws_lambda_function' },
      { name: 'IAM Role', type: 'aws_iam_role' },
      { name: 'API Gateway (if HTTP)', type: 'aws_apigatewayv2_api', optional: true },
    ],
    gcp: [
      { name: 'Cloud Function', type: 'google_cloudfunctions2_function' },
    ],
    azure: [
      { name: 'Function App', type: 'azurerm_linux_function_app' },
      { name: 'App Service Plan', type: 'azurerm_service_plan' },
    ],
  },
  snippets: defineSnippets({
    ts: `// AWS Lambda handler
export const handler = async (event: any) => {
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};`,
    py: `# GCP Cloud Function
import functions_framework

@functions_framework.http
def hello(request):
    return {"ok": True}`,
    go: `package function
import (
    "encoding/json"
    "net/http"
)
func Handler(w http.ResponseWriter, r *http.Request) {
    json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}`,
  }),
  links: [
    { label: 'AWS Lambda', url: 'https://docs.aws.amazon.com/lambda/' },
    { label: 'GCP Cloud Functions', url: 'https://cloud.google.com/functions/docs' },
  ],
  relatedConcepts: ['Compute.Container', 'Compute.Worker', 'Messaging.MessageQueue'],
};
