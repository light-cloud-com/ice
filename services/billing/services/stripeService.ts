// Re-export from the real stripe service (routes import from ../../services/)
export {
  handleWebhookEvent,
  updateUserBillingDetails,
  getUserBillingDetails,
  createUserSetupIntent,
  attachUserPaymentMethod,
  removeUserPaymentMethod,
  getUserBilling,
  isStripeConfigured,
} from '../src/services/stripe.service.js';
