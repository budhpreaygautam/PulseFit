// Global types for Razorpay Checkout (loaded from https://checkout.razorpay.com/v1/checkout.js)
export {};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
  }

  interface RazorpayCheckoutOptions {
    key: string; // public key id
    amount: number; // in paise
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    image?: string;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    notes?: Record<string, string>;
    theme?: {
      color?: string;
    };
    handler: (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => void;
    modal?: {
      ondismiss?: () => void;
    };
  }

  interface RazorpayCheckout {
    on: (event: string, handler: (response: any) => void) => void;
    open: () => void;
    close: () => void;
  }
}