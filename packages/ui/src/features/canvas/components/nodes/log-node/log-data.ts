export const SAMPLE_MESSAGES: Record<string, Array<{ level: string; message: string }>> = {
  'order-service': [
    { level: 'info', message: 'Processing order #ORD-2847291' },
    { level: 'info', message: 'Inventory check passed for SKU-8821' },
    { level: 'info', message: 'Payment authorized via Stripe' },
    { level: 'warn', message: 'High latency detected: 245ms' },
    { level: 'info', message: 'Order confirmed, sending to fulfillment' },
    { level: 'debug', message: 'Cache hit for product catalog' },
    { level: 'error', message: 'Failed to update inventory: timeout' },
    { level: 'info', message: 'Retry successful for inventory update' },
  ],
  'payment-service': [
    { level: 'info', message: 'Initiating payment for $127.99' },
    { level: 'debug', message: 'Stripe API call started' },
    { level: 'info', message: 'Card ending in 4242 authorized' },
    { level: 'info', message: 'Transaction ID: txn_3Nk8sH2eZvKY' },
    { level: 'warn', message: 'Rate limit approaching: 85%' },
    { level: 'error', message: '3DS authentication required' },
    { level: 'info', message: 'Refund processed: $24.99' },
  ],
  default: [
    { level: 'info', message: 'Service started successfully' },
    { level: 'info', message: 'Health check passed' },
    { level: 'debug', message: 'Configuration loaded' },
    { level: 'info', message: 'Connected to database' },
    { level: 'warn', message: 'Memory usage at 75%' },
    { level: 'info', message: 'Processing request...' },
  ],
};

export function generateTimestamp(secondsAgo: number = 0): string {
  const now = new Date();
  now.setSeconds(now.getSeconds() - secondsAgo);
  return now.toISOString().split('T')[1].split('.')[0];
}
