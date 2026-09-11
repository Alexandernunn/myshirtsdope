export const STORE_SUPPORT_EMAIL = "info@myshirtsdope.com";
export const STORE_LAST_UPDATED = "September 10, 2026";

export interface StorePageSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface StorePageDefinition {
  path: string;
  title: string;
  shortTitle: string;
  description: string;
  schemaType: "AboutPage" | "ContactPage" | "WebPage";
  sections: StorePageSection[];
}

export const POLICY_PAGES: StorePageDefinition[] = [
  {
    path: "/shipping-policy",
    title: "Shipping Policy",
    shortTitle: "Shipping",
    description: "How shipping destinations, charges, order preparation, tracking, and delivery issues are handled by MyShirtsDope.",
    schemaType: "WebPage",
    sections: [
      {
        heading: "Where we ship",
        paragraphs: [
          "MyShirtsDope accepts orders for destinations made available during checkout. We ship within the United States and to supported international destinations.",
          "Enter the complete delivery address during checkout to see whether shipping is available for your destination.",
        ],
      },
      {
        heading: "Shipping charges and timing",
        paragraphs: [
          "Shipping charges are calculated and displayed during checkout before payment is submitted. Available delivery estimates may vary by product and destination.",
          "MyShirtsDope products are printed and fulfilled by Printful after an order is placed. Printful's standard fulfillment estimate is 2–5 business days for most products. Some products or temporary availability issues may take longer.",
          "After fulfillment, Printful currently estimates 1–8 business days for domestic shipping and 1–20 business days for international shipping. Fulfillment and shipping time must be added together. These are estimates, not guaranteed delivery dates.",
        ],
      },
      {
        heading: "Tracking and delivery issues",
        paragraphs: [
          `When tracking is available, it is sent using the contact information provided with the order. For a missing, delayed, damaged, or incorrectly delivered order, contact ${STORE_SUPPORT_EMAIL} with the order number and a description of the issue.`,
          "Customers are responsible for entering a complete and accurate delivery address. International orders may be subject to taxes, duties, or customs charges imposed by the destination country; these charges are not included unless checkout expressly says otherwise.",
        ],
      },
    ],
  },
  {
    path: "/returns-refunds",
    title: "Returns & Refunds",
    shortTitle: "Returns & Refunds",
    description: "MyShirtsDope return eligibility, claim timing, exchanges, return shipping, and refund process.",
    schemaType: "WebPage",
    sections: [
      {
        heading: "Requesting help",
        paragraphs: [
          `Contact ${STORE_SUPPORT_EMAIL} within 30 days after delivery to request a return. Include the order number and reason for the request. If an item arrives faulty, damaged, or incorrect, also include a description of the problem and clear photos when relevant.`,
          "Do not send an item back before receiving return instructions. Unauthorized returns may not be accepted.",
        ],
      },
      {
        heading: "Eligibility",
        bullets: [
          "The item must be unused, in the condition received, and in its original packaging.",
          "Proof of purchase is required.",
          "Unused change-of-mind and wrong-size items may be returned when the request is made within 30 days after delivery and the return is authorized.",
          "Cancellation requests are not guaranteed after production has begun.",
          "Sale items and gift cards are not eligible for return unless required by applicable law.",
        ],
      },
      {
        heading: "Exchanges, shipping, and refunds",
        paragraphs: [
          "Eligible exchanges are subject to availability. A refund may be offered instead when a replacement is unavailable.",
          "Customers are responsible for return shipping on all approved returns unless applicable law requires otherwise. MyShirtsDope does not provide prepaid return labels. Original shipping charges are not refundable.",
          "After an authorized return is received and inspected, MyShirtsDope will email the approval or denial. Approved refunds are submitted to the original payment method within 30 business days. The payment provider may need additional time to post the credit.",
        ],
      },
    ],
  },
  {
    path: "/privacy-policy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    description: "How MyShirtsDope collects, uses, shares, and protects information when customers visit or shop.",
    schemaType: "WebPage",
    sections: [
      {
        heading: "Information we collect",
        paragraphs: [
          "When you visit, contact, or purchase from MyShirtsDope, information may include contact and delivery details, order and payment-related details, messages you send, device and browser information, IP address, cookie identifiers, and storefront activity.",
          "Payment card details are processed by the checkout and payment providers and are not stored by this storefront.",
        ],
      },
      {
        heading: "How information is used",
        bullets: [
          "To process, fulfill, and support orders.",
          "To operate, secure, measure, and improve the storefront.",
          "To respond to questions and prevent fraud or misuse.",
          "To comply with legal, tax, accounting, and regulatory duties.",
          "To measure advertising and marketing performance where consent or applicable law permits.",
        ],
      },
      {
        heading: "Service providers and choices",
        paragraphs: [
          "MyShirtsDope uses service providers to operate the store, including Shopify for commerce and checkout, Formspree for contact-form delivery, and analytics or advertising providers such as Google and Meta. These providers process information under their own terms and privacy practices.",
          "Use the Privacy Choices control in the website footer to allow or refuse advertising data sharing. MyShirtsDope also honors supported Global Privacy Control browser signals as a refusal. Depending on where you live, you may have rights to request access, correction, deletion, or restriction of personal information.",
          `To make a privacy request, email ${STORE_SUPPORT_EMAIL}. MyShirtsDope may need to verify the request before acting on it.`,
        ],
      },
      {
        heading: "Sale or sharing and opt-out requests",
        paragraphs: [
          "MyShirtsDope uses advertising and analytics services, including Google and Meta. Providing identifiers and storefront activity to these services for advertising measurement or personalized advertising may be considered a sale or sharing of personal information under some privacy laws.",
          `Use the Privacy Choices control in the website footer to refuse advertising data sharing. You may also email ${STORE_SUPPORT_EMAIL} with the subject “Do Not Sell or Share My Personal Information.” MyShirtsDope will process verified requests as required by applicable law.`,
        ],
      },
      {
        heading: "Updates",
        paragraphs: [
          `This policy was last updated ${STORE_LAST_UPDATED}. It may be updated when store practices, service providers, or legal requirements change.`,
        ],
      },
    ],
  },
  {
    path: "/terms-of-service",
    title: "Terms of Service",
    shortTitle: "Terms",
    description: "Terms governing use of the MyShirtsDope website, purchases, product information, and customer responsibilities.",
    schemaType: "WebPage",
    sections: [
      {
        heading: "Using the store",
        paragraphs: [
          "By using this website or placing an order, you agree to these terms and the policies linked from this website. You must provide accurate account, contact, payment, and delivery information and use the store only for lawful purposes.",
          "MyShirtsDope may refuse or cancel an order affected by suspected fraud, an obvious pricing or inventory error, an unavailable product, or a legal restriction. If payment was captured for a canceled order, it will be returned to the original payment method.",
        ],
      },
      {
        heading: "Products, prices, and orders",
        paragraphs: [
          "Product colors and appearance may vary slightly by screen and production process. Prices, availability, descriptions, and promotions may change without notice. The price and shipping charge shown during checkout apply to the submitted order.",
          "An order confirmation acknowledges receipt of the order. It does not override a cancellation permitted by these terms. Customers are responsible for reviewing product selections, size, color, quantity, and delivery details before submitting payment.",
        ],
      },
      {
        heading: "Content and third-party services",
        paragraphs: [
          "Store content, branding, graphics, and original designs may not be copied or commercially exploited without permission. References to culture, music, events, places, songs, or artists do not claim endorsement unless expressly stated.",
          "The storefront relies on third-party commerce, payment, fulfillment, analytics, and communication services. Their services may have separate terms and may occasionally be unavailable.",
        ],
      },
      {
        heading: "Contact and policy updates",
        paragraphs: [
          `Questions about these terms can be sent to ${STORE_SUPPORT_EMAIL}. These terms were last updated ${STORE_LAST_UPDATED}.`,
          "Nothing in these terms limits rights that cannot legally be limited under applicable consumer law.",
        ],
      },
    ],
  },
];

export const POLICY_PAGES_BY_PATH = new Map(POLICY_PAGES.map((page) => [page.path, page]));
export const PUBLIC_TRUST_PATHS = ["/about", "/contact", ...POLICY_PAGES.map((page) => page.path)];