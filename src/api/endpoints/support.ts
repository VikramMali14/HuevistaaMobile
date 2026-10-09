import { api } from "../instance";

/**
 * Help and support (S6, S7): a chat that the HueVistaa assistant answers straight away,
 * and that a person from the team takes over when asked (or when the assistant can't
 * help). Any signed-in account; each sees only its own conversations.
 *
 * The assistant answers inside the request, so starting a chat or sending a message can
 * take many seconds — hence the long wait below. Neither carries a request key: a repeat
 * is a second message (and a second paid answer), so neither is ever sent twice by itself.
 * Both share 40 an hour per network. Asking for a person is free and never limited.
 */

export type SupportStatus = "OPEN" | "NEEDS_HUMAN" | "RESOLVED";
export type SupportSender = "USER" | "AI" | "AGENT" | "SYSTEM";

export interface SupportMessage {
  id: string;
  sender: SupportSender | (string & {});
  /** Plain text, line breaks kept. Never markdown or HTML to render. */
  body: string;
  createdAt: string;
}

/** GET /api/support/conversations/{id}, and what a start or a message answers with. */
export interface Conversation {
  id: string;
  channel: string;
  status: SupportStatus | (string & {});
  subject: string | null;
  createdAt: string;
  updatedAt: string;
  /** In the server's order — never sorted again here (a question and its answer can share a time). */
  messages: SupportMessage[];
}

/** GET /api/support/conversations — newest first, every one the account ever had. */
export interface ConversationSummary {
  id: string;
  channel: string;
  status: SupportStatus | (string & {});
  subject: string | null;
  /** The newest message of any kind, whole. */
  lastMessage: string;
  updatedAt: string;
}

/** Longer than the server waits for the assistant (120 s). */
const ASSISTANT_WAIT_MS = 130_000;

export const supportApi = {
  conversations: () => api.request<ConversationSummary[]>("api/support/conversations"),

  /** 404 "Conversation not found" — for one that isn't this account's, too. */
  conversation: (id: string) => api.request<Conversation>(`api/support/conversations/${encodeURIComponent(id)}`),

  /** 201 with the assistant's answer already in it. The subject is made from the message. */
  start: (message: string) =>
    api.request<Conversation>("api/support/conversations", { method: "POST", body: { message }, timeoutMs: ASSISTANT_WAIT_MS }),

  /**
   * The field is `body` here (`message` on start). Waiting for a person, it's only added;
   * otherwise the assistant answers. Into a resolved chat it reopens it — which the app
   * doesn't do: a resolved chat is followed by a new one (see S7).
   */
  send: (id: string, body: string) =>
    api.request<Conversation>(`api/support/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: { body },
      timeoutMs: ASSISTANT_WAIT_MS,
    }),

  /** Hands the chat to a person. Doing it again changes nothing. */
  requestHuman: (id: string) =>
    api.request<Conversation>(`api/support/conversations/${encodeURIComponent(id)}/request-human`, { method: "POST" }),
};
