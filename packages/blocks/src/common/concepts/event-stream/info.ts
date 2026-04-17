import type { InfoContent } from '../_shared/types';

export const eventStreamInfo: InfoContent = {
  overview: {
    markdown: `
# Event Stream

A durable pub/sub stream. Many consumers can subscribe; each sees every
event. Events are retained for a period so late consumers can catch up.

## When to use

- Broadcasting domain events ("OrderCreated", "UserSignedUp")
- Analytics event pipelines
- Feeding multiple downstream services from one source

## vs Message Queue

Event Streams fan out; Message Queues are point-to-point. If you want one
consumer to process each message exactly once, use a **Message Queue**.
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'Kinesis Data Stream', type: 'aws_kinesis_stream' }],
    gcp: [{ name: 'Pub/Sub Topic', type: 'google_pubsub_topic' }],
    azure: [{ name: 'Event Hub', type: 'azurerm_eventhub' }, { name: 'Event Hub Namespace', type: 'azurerm_eventhub_namespace' }],
  },
  relatedConcepts: ['Messaging.Queue', 'Compute.ServerlessFunction', 'Compute.Worker'],
};
