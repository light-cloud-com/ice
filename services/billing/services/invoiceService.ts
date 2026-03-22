export async function generateAllMonthlyInvoices() { return { generated: 0, skipped: 0, errors: [] }; }
export async function listInvoices(_orgId: string) { return []; }
export async function getInvoice(_invoiceId: string) { return null; }
export async function retryInvoicePayment(_invoiceId: string) { return { success: false }; }
