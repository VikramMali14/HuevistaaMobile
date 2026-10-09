import { api } from "../instance";

/**
 * The community: reviews of a finished job (C26, D1). Signed in, any role; the role decides
 * the answer, not the door.
 */

export type ReviewStatus = "PENDING" | "PUBLISHED" | "REJECTED";

export interface OwnReview {
  /** 1–5. */
  rating: number;
  /** As the server cleaned it. */
  body: string;
  displayName: string;
  status: ReviewStatus | (string & {});
  /** India's time, no zone. */
  createdAt: string;
}

/** GET/POST /api/community/reviews/board/{token} (BoardReviewStateResponse). */
export interface BoardReviewState {
  /** The owner, with nothing written yet. */
  canReview: boolean;
  /** Why not, in the server's words. Null when it can be reviewed — and for the author. */
  reason: string | null;
  /** The shop the room came through; null when it didn't come through one. */
  shopName: string | null;
  /** "Priya S." from the account's name; "" when there isn't one of its own. */
  suggestedName: string;
  /** The author, while nothing stops it (withdrawn, no longer the owner…). No time limit. */
  canEdit: boolean;
  /** Only to its author. */
  review: OwnReview | null;
}

export interface ReviewBody {
  rating: number;
  body: string;
  displayName: string;
}

/** An answered question, as everyone sees it (PublicQuestionResponse). */
export interface PublicQuestion {
  id: string;
  /** "A visitor" once the asker's account is gone. */
  displayName: string;
  /** Up to 500 characters, line breaks kept; the team may have reworded it. */
  question: string;
  /** Up to 2000 characters, line breaks kept. */
  answer: string;
  askedAt: string;
  answeredAt: string;
}

/** GET /api/community/questions — newest answer first. */
export interface QuestionPage {
  items: PublicQuestion[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export type QuestionStatus = "PENDING" | "PUBLISHED" | "REJECTED";

/** One of the account's own questions, in any state (QuestionResponse). */
export interface OwnQuestion {
  id: string;
  displayName: string;
  question: string;
  /** Shown only once PUBLISHED — a taken-down one can still carry its old answer. */
  answer: string | null;
  status: QuestionStatus | (string & {});
  askedAt: string;
  answeredAt: string | null;
}

/** GET /api/community/questions/mine — the 20 newest, and the name to suggest. */
export interface MyQuestions {
  suggestedName: string;
  questions: OwnQuestion[];
}

export const communityApi = {
  /** Public; offset pages of up to 50 (20 here). Never 401s. */
  questions: (page: number, size = 20) => api.request<QuestionPage>("api/community/questions", { query: { page, size } }),

  myQuestions: () => api.request<MyQuestions>("api/community/questions/mine"),

  /**
   * Asks one (PENDING until the team answers it). 409 when the account already has its
   * limit waiting for an answer — the sentence says how many. No request key; limited to 10
   * an hour per network, shared with reviews, every attempt counted.
   */
  ask: (body: string, displayName: string) =>
    api.request<OwnQuestion>("api/community/questions", { method: "POST", body: { body, displayName } }),

  /**
   * What this board allows the caller. 404 "That code isn't one of ours." for an unknown
   * token. Every refusal is a 200 with `reason`.
   */
  boardReview: (token: string) => api.request<BoardReviewState>(`api/community/reviews/board/${encodeURIComponent(token)}`),

  /**
   * Writes the review, or rewrites the author's (back to PENDING — off the public page until
   * it is read again). No request key: a repeat by the author is the same rewrite, and a
   * second first-write loses with 409 "This board has already been reviewed." Limited to 10
   * an hour per network, shared with questions, every attempt counted.
   */
  submitReview: (token: string, body: ReviewBody) =>
    api.request<BoardReviewState>(`api/community/reviews/board/${encodeURIComponent(token)}`, { method: "POST", body }),

  /**
   * This room's board code, to review it from the room (C26). 404 "This room doesn't have a
   * colour board yet…" when none was made; 404 "Project not found: {id}" for a room that
   * isn't the caller's.
   */
  boardForProject: (projectId: string) =>
    api.request<{ token: string }>(`api/community/reviews/project/${encodeURIComponent(projectId)}`),
};
