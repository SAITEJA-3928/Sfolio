type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only be used in the browser"));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")));
        return;
      }

      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
      document.body.appendChild(script);
    });
  }

  return scriptPromise;
}

export type CampaignRazorpayCheckoutInput = {
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  currency?: string;
  campaignName?: string;
};

export async function openCampaignRazorpayCheckout(
  payment: CampaignRazorpayCheckoutInput,
  handlers: {
    onSuccess: (response: RazorpaySuccessResponse) => void | Promise<void>;
    onDismiss?: () => void;
  },
) {
  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error("Razorpay checkout is unavailable");
  }

  return new Promise<void>((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: payment.razorpayKeyId,
      amount: payment.amountInPaise,
      currency: payment.currency ?? "INR",
      name: "GFolio",
      description: payment.campaignName ?? "Campaign payment",
      order_id: payment.razorpayOrderId,
      handler: (response) => {
        void Promise.resolve(handlers.onSuccess(response)).then(() => resolve());
      },
      modal: {
        ondismiss: () => {
          handlers.onDismiss?.();
          resolve();
        },
      },
    });

    checkout.on("payment.failed", (response) => {
      reject(new Error(response.error?.description ?? "Payment failed"));
    });

    checkout.open();
  });
}
