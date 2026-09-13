export type Step =
  | "register"
  | "code"
  | "kyc"
  | "deposit"
  | "deposit_bitopro"
  | "deposit_card"
  | "uid";
export type Stage =
  "new" | "registering" | "kyc" | "deposit" | "review" | "joined";
export type Preference = "unknown" | "spot" | "futures" | "both" | "learning";
export type Customer = {
  line_user_id: string;
  display_name: string;
  line_handle: string;
  stage: Stage;
  guide_step: Step;
  preference: Preference;
  notes: string;
  support_requested: number;
  marketing_consent: number;
  consent_at: string | null;
  blocked: number;
  last_event_at: number;
  created_at: string;
  updated_at: string;
};
export type Action =
  | { type: "message"; label: string; text: string }
  | { type: "uri"; label: string; uri: string }
  | { type: "postback"; label: string; data: string; displayText: string };
export type LineMessage =
  | {
      type: "text";
      text: string;
      quickReply?: { items: { type: "action"; action: Action }[] };
    }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string };
export type LineEvent = {
  webhookEventId: string;
  type: string;
  timestamp: number;
  source?: { type: string; userId?: string };
  replyToken?: string;
  message?: { type: string; text?: string };
  postback?: { data: string };
};
export type Account = {
  uid: string;
  referral_status: string;
  deposit_status: string;
  verification_note: string;
  deposit_note: string;
};
