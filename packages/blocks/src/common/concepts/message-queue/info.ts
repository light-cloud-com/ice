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
    markdownZh: `
# 消息队列

点对点的异步工作队列。生产者(例如 **可扩展后端**)投递消息,消费者(**Worker**)取走并处理。消息会持久化存储,直到被确认消费。

## 适用场景

- 将慢任务从请求处理器中卸载(发送邮件、视频转码)
- 解耦生产者与消费者(不同团队、不同处理速率)
- 重试逻辑、失败任务的死信队列

## 与事件流的对比

**消息队列** 是点对点的(一条消息,一个消费者);**事件流** 是 pub/sub 扇出(一条消息,多个消费者)。分发任务用队列;广播事件用流。
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'SQS Queue', type: 'aws_sqs_queue' }],
    gcp: [{ name: 'Pub/Sub Topic + Subscription', type: 'google_pubsub_topic' }],
    azure: [{ name: 'Service Bus Queue', type: 'azurerm_servicebus_queue' }],
  },
  relatedConcepts: ['Messaging.EventStream', 'Compute.Worker', 'Compute.ServerlessFunction'],
};
