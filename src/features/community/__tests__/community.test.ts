import type { QuestionPage } from "@/api/endpoints/community";

import { flatten, questionProblems } from "../questions";
import { cleanBody, cleanName, ready, reviewProblems, starLabel, statusLine } from "../review";

describe("the text as the server keeps it (CommunityText)", () => {
  it("folds spaces, keeps paragraphs, and allows one blank line", () => {
    expect(cleanBody("  Lovely   colours\t\there.  ")).toBe("Lovely colours here.");
    expect(cleanBody("First line  \r\n   second\r\n\r\n\r\n\r\nthird")).toBe("First line\nsecond\n\nthird");
  });

  it("puts a name on one line", () => {
    expect(cleanName("  Priya \n  S. ")).toBe("Priya S.");
  });
});

describe("a review (C26, D1)", () => {
  // Spaces that the server folds away don't count towards the 10.
  it("is held to the server's minimum after cleaning", () => {
    expect(reviewProblems(4, "a    b    c", "Priya S.").body).toBe("Tell us a little more — at least 10 characters.");
    expect(reviewProblems(4, "Great finish, thank you", "Priya S.")).toEqual({ rating: null, body: null, name: null });
  });

  it("needs a star, words and a name", () => {
    const p = reviewProblems(0, "  ", " ");
    expect(p.rating).toBe("Tap a star to give your rating.");
    expect(p.body).toBe("Tell us a little about how it went.");
    expect(p.name).toBe("Enter the name to show with your review.");
    expect(ready(p)).toBe(false);
    expect(reviewProblems(5, "Great finish, thank you", "P").name).toBe("Use a name between 2 and 60 characters.");
  });

  it("names the stars and the states as the website does", () => {
    expect(starLabel(0)).toBe("Tap a star");
    expect(starLabel(5)).toBe("Excellent");
    expect(statusLine("PENDING")).toMatch(/once we've read it/);
    expect(statusLine("PUBLISHED")).toBe("It's on the Community page now.");
    expect(statusLine("REJECTED")).toMatch(/couldn't publish/);
  });
});

describe("a question (S8)", () => {
  it("is held to 10–500 characters after cleaning, and a name of 2–60", () => {
    expect(questionProblems("Does it   work outside?", "Ravi K.")).toEqual({ body: null, name: null });
    expect(questionProblems("a    b    c", "Ravi K.").body).toBe("Your question needs at least 10 characters.");
    expect(questionProblems("x".repeat(501), "Ravi K.").body).toBe("Keep it under 500 characters.");
    expect(questionProblems("Does it work outside?", " ").name).toBe("Enter the name to show with your question.");
  });

  // A newly answered question moves to the top, so the next page can repeat one.
  it("keeps each question once across pages", () => {
    const q = (id: string) => ({ id, displayName: "A", question: "Q", answer: "A", askedAt: "", answeredAt: "" });
    const pages: QuestionPage[] = [
      { items: [q("1"), q("2")], total: 3, page: 0, size: 2, hasMore: true },
      { items: [q("2"), q("3")], total: 3, page: 1, size: 2, hasMore: false },
    ];
    expect(flatten(pages).map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(flatten(undefined)).toEqual([]);
  });
});
