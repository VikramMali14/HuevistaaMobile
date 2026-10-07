import { checkoutUrl, describeOrder, parsePayCallback } from "../pay-link";

const SIG = "a".repeat(64);

describe("what the payment page hands back", () => {
  it("reads a success from the fragment, as the page names it", () => {
    expect(parsePayCallback(`huevista://pay/callback#status=success&order_id=order_ABC123xyz&payment_id=pay_DEF456uvw&signature=${SIG}`)).toEqual({
      status: "success",
      orderId: "order_ABC123xyz",
      paymentId: "pay_DEF456uvw",
      signature: SIG,
    });
  });

  it("reads a cancellation and a refusal with the gateway's reason", () => {
    expect(parsePayCallback("huevista://pay/callback#status=cancelled")).toEqual({ status: "cancelled" });
    expect(parsePayCallback("huevista://pay/callback#status=failed&code=BAD_REQUEST_ERROR&description=Payment+declined%20by+bank")).toEqual({
      status: "failed",
      code: "BAD_REQUEST_ERROR",
      description: "Payment declined by bank",
    });
  });

  it("never believes a success whose ids are not Razorpay's", () => {
    for (const url of [
      `huevista://pay/callback#status=success&order_id=evil&payment_id=pay_DEF456uvw&signature=${SIG}`,
      `huevista://pay/callback#status=success&order_id=order_ABC123xyz&payment_id=pay_x&signature=${SIG}`,
      "huevista://pay/callback#status=success&order_id=order_ABC123xyz&payment_id=pay_DEF456uvw&signature=<script>",
      // In the query rather than the fragment: not how the page answers.
      `huevista://pay/callback?status=success&order_id=order_ABC123xyz&payment_id=pay_DEF456uvw&signature=${SIG}`,
      "huevista://pay/callback",
      null,
    ]) {
      expect(parsePayCallback(url)).toEqual({ status: "unknown" });
    }
  });

  it("survives a broken escape", () => {
    expect(parsePayCallback("huevista://pay/callback#status=failed&description=%E0%A4")).toEqual({ status: "failed", code: undefined, description: undefined });
  });
});

describe("the checkout page link", () => {
  it("carries the order, the public key, the amount and the prefill — nothing else", () => {
    const url = checkoutUrl(
      { orderId: "order_ABC123xyz", razorpayKeyId: "rzp_test_123456", amountPaise: 28900, currency: "INR" },
      "2 rooms + 1 AI credit",
      { name: "Priya Sharma", email: "", contact: "+919876543210" },
    );
    expect(url).toBe(
      "https://huevistaa.com/pay/mobile?order=order_ABC123xyz&key=rzp_test_123456&amount=28900&currency=INR&desc=2%20rooms%20%2B%201%20AI%20credit&name=Priya%20Sharma&contact=%2B919876543210",
    );
  });

  it("describes what the order hands over", () => {
    expect(describeOrder({ projectsGranted: 3, creditsGranted: 3 })).toBe("3 rooms + 3 AI credits");
    expect(describeOrder({ projectsGranted: 1, creditsGranted: 0 })).toBe("1 room");
    expect(describeOrder({ projectsGranted: 0, creditsGranted: 1 })).toBe("1 AI credit");
  });
});
