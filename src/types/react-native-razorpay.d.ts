declare module 'react-native-razorpay' {
  type RazorpayCheckoutOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: {
      name?: string | null;
      email?: string | null;
      contact?: string | null;
    };
    notes?: Record<string, string>;
    theme?: {
      color?: string;
    };
  };

  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<unknown>;
  };

  export default RazorpayCheckout;
}
