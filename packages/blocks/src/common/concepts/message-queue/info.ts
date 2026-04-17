import type { InfoContent } from '../_shared/types';

export const messageQueueInfo: InfoContent = {
  overview: {
    markdown: `
# Message Queue

Point-to-point async work queue. A producer (e.g., a **Scalable Backend**)
drops a message; a consumer (a **Worker**) picks it up and processes it.
Messages are durably stored until acknowledged.

## When to use

- Hand off slow work from your request handler (email send, video encode)
- Decouple producer and consumer (different teams, different rates)
- Retry logic, dead-letter queues for failed jobs

## vs Event Stream

A **Message Queue** is point-to-point (one message, one consumer). An
**Event Stream** is pub/sub fan-out (one message, many consumers). Use a
queue for work distribution; use a stream for event broadcasting.
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'SQS Queue', type: 'aws_sqs_queue' }],
    gcp: [{ name: 'Pub/Sub Topic + Subscription', type: 'google_pubsub_topic' }],
    azure: [{ name: 'Service Bus Queue', type: 'azurerm_servicebus_queue' }],
  },
  relatedConcepts: ['Messaging.EventStream', 'Compute.Worker', 'Compute.ServerlessFunction'],
};
