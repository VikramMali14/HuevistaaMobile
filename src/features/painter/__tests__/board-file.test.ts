import { redirectSystemPath } from "../../../../app/+native-intent";
import { boardKindOf, MAX_FILE_BYTES, problemMessage, problemWith } from "../board-file";
import { holdSharedBoard, isFileUrl, takeSharedBoard } from "../shared-board";

const file = (name: string, mime: string, size: number | null = 1000) => ({ uri: "file:///cache/x", name, mime, size });

describe("a board's file (P7)", () => {
  it("knows a PDF or a photo by its type, else by its name", () => {
    expect(boardKindOf(file("Board.pdf", ""))).toBe("pdf");
    expect(boardKindOf(file("board", "application/pdf"))).toBe("pdf");
    expect(boardKindOf(file("IMG_2041.HEIC", ""))).toBe("image");
    expect(boardKindOf(file("photo", "image/jpeg"))).toBe("image");
    expect(boardKindOf(file("notes.docx", "application/vnd.openxmlformats"))).toBeNull();
  });

  it("refuses a file that isn't a board, or is over 25 MB, before reading it", () => {
    expect(problemWith(file("notes.txt", "text/plain"))).toBe("wrongType");
    expect(problemWith(file("big.pdf", "application/pdf", MAX_FILE_BYTES + 1))).toBe("tooBig");
    expect(problemWith(file("ok.pdf", "application/pdf", MAX_FILE_BYTES))).toBeNull();
    expect(problemWith(file("unknown-size.pdf", "application/pdf", null))).toBeNull();
  });

  it("says why in the website's words", () => {
    expect(problemMessage("tooBig")).toMatch(/over 25 MB/);
    expect(problemMessage("locked")).toMatch(/password-protected/);
    expect(problemMessage("canvas")).toBe(problemMessage("failed"));
  });
});

describe("a PDF opened with HueVistaa from another app", () => {
  it("is held for P7, once, and P7 is where it goes", () => {
    const to = redirectSystemPath({ path: "content://com.whatsapp.provider.media/item/123", initial: true });
    expect(to).toMatch(/^\/painter\/upload-board\?shared=\d+$/);
    expect(takeSharedBoard()).toBe("content://com.whatsapp.provider.media/item/123");
    expect(takeSharedBoard()).toBeNull();
  });

  // A second file is new to a P7 already open.
  it("marks each file handed over as new", () => {
    expect(holdSharedBoard("file:///a.pdf")).not.toBe(holdSharedBoard("file:///b.pdf"));
    expect(takeSharedBoard()).toBe("file:///b.pdf");
  });

  // App Links: the website's board and share links open the same screens here.
  it("opens the website's board and shared-room links on their screens, without tags", () => {
    expect(redirectSystemPath({ path: "https://huevistaa.com/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg", initial: true })).toBe("/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg");
    expect(redirectSystemPath({ path: "https://huevistaa.com/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg/?utm_source=wa#x", initial: false })).toBe("/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg");
    expect(redirectSystemPath({ path: "https://huevistaa.com/share/0123456789abcdef0123456789abcdef", initial: true })).toBe("/share/0123456789abcdef0123456789abcdef");
    // Anything else on the site is the website's, not ours.
    expect(redirectSystemPath({ path: "https://huevistaa.com/pay/mobile?order=1", initial: false })).toBe("https://huevistaa.com/pay/mobile?order=1");
    expect(redirectSystemPath({ path: "https://evil.example/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg", initial: false })).toBe("https://evil.example/r/0VkTlzUw5CGJ-bTtxixeiS0nVfg");
  });

  it("leaves every other link as it came", () => {
    expect(redirectSystemPath({ path: "huevista://r/abc", initial: false })).toBe("huevista://r/abc");
    expect(redirectSystemPath({ path: "/painter/scan", initial: false })).toBe("/painter/scan");
    expect(isFileUrl("https://huevistaa.com/r/x")).toBe(false);
    expect(takeSharedBoard()).toBeNull();
  });
});
