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
    markdownZh: `
# 事件流

持久化的 pub/sub 流。多个消费者可同时订阅,每位消费者都能看到所有事件。事件会保留一段时间,以便迟到的消费者也能追上。

## 适用场景

- 广播领域事件("OrderCreated"、"UserSignedUp")
- 分析事件流水线
- 从一个数据源同时供给多个下游服务

## 与消息队列的对比

事件流是扇出的;消息队列是点对点的。如果您希望每条消息恰好被一个消费者处理一次,请使用 **消息队列**。
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'Kinesis Data Stream', type: 'aws_kinesis_stream' }],
    gcp: [{ name: 'Pub/Sub Topic', type: 'google_pubsub_topic' }],
    azure: [
      { name: 'Event Hub', type: 'azurerm_eventhub' },
      { name: 'Event Hub Namespace', type: 'azurerm_eventhub_namespace' },
    ],
  },
  relatedConcepts: ['Messaging.Queue', 'Compute.ServerlessFunction', 'Compute.Worker'],
};
