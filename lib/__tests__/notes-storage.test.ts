import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeTags,
  normalizeBlocks,
  blocksFromContent,
  plainTextFromBlocks,
  contentFromBlocks,
  isAllowedAttachment,
  MAX_NOTE_CONTENT_LENGTH,
  LOCAL_ATTACHMENT_LIMIT,
  REMOTE_ATTACHMENT_LIMIT,
} from "@/lib/notes-storage";

describe("notes-storage", () => {
  beforeEach(() => {
    // Ensure crypto.randomUUID is deterministic for tests where needed
    if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
      // @ts-expect-error polyfill for test env
      globalThis.crypto = { randomUUID: () => "test-uuid" };
    }
  });

  describe("normalizeTags", () => {
    it("trims whitespace", () => {
      expect(normalizeTags(["  hello  ", "world "])).toEqual(["hello", "world"]);
    });

    it("dedups after trim", () => {
      expect(normalizeTags(["tag", " tag ", "tag"])).toEqual(["tag"]);
    });

    it("filters empty strings after trim", () => {
      expect(normalizeTags(["", "   ", "a", ""])).toEqual(["a"]);
    });

    it("handles non-string inputs via String() conversion", () => {
      expect(normalizeTags([123 as unknown as string, true as unknown as string, 0 as unknown as string])).toEqual([
        "123",
        "true",
        "0",
      ]);
    });

    it("handles numbers and dedups after String conversion", () => {
      expect(normalizeTags([42 as unknown as string, "42", " 42 "])).toEqual(["42"]);
    });

    it("filters empty after String conversion (null/undefined)", () => {
      // String(null) = "null", String(undefined) = "undefined" -> non-empty, but whitespace-only becomes empty
      expect(normalizeTags([" ", "  \t\n  "])).toEqual([]);
    });

    it("preserves order of first occurrence", () => {
      expect(normalizeTags(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
    });
  });

  describe("normalizeBlocks", () => {
    it("when value is not array returns blocksFromContent(content)", () => {
      const result = normalizeBlocks(null, "hello");
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("paragraph");
      expect(result[0].text).toBe("hello");
      expect(typeof result[0].id).toBe("string");
    });

    it("when value is not array with undefined content returns paragraph with empty text", () => {
      const result = normalizeBlocks(undefined as unknown as string[]);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("");
    });

    it("filters invalid objects in array", () => {
      const result = normalizeBlocks([null, undefined, 123, "string", {}] as unknown as [], "fallback");
      // {} is an object but with no id/type/text => should create paragraph with empty text
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("paragraph");
      expect(result[0].text).toBe("");
    });

    it("type coercion defaults to paragraph for unknown type", () => {
      const result = normalizeBlocks([{ type: "unknown", text: "hi" } as unknown as { type: string }], "");
      expect(result[0].type).toBe("paragraph");
    });

    it("preserves valid block types", () => {
      const result = normalizeBlocks(
        [
          { id: "1", type: "heading", text: "h" },
          { id: "2", type: "bullet", text: "b" },
          { id: "3", type: "checklist", text: "c", checked: true },
          { id: "4", type: "paragraph", text: "p" },
        ],
        ""
      );
      expect(result.map((b) => b.type)).toEqual(["heading", "bullet", "checklist", "paragraph"]);
    });

    it("checklist checked boolean handling true/false/missing", () => {
      const result = normalizeBlocks(
        [
          { id: "1", type: "checklist", text: "a", checked: true },
          { id: "2", type: "checklist", text: "b", checked: false },
          { id: "3", type: "checklist", text: "c" },
          { id: "4", type: "checklist", text: "d", checked: 1 as unknown as boolean },
          { id: "5", type: "paragraph", text: "e", checked: true },
        ],
        ""
      );
      expect(result[0].checked).toBe(true);
      expect(result[1].checked).toBe(false);
      expect(result[2].checked).toBe(false); // missing -> Boolean(undefined) = false
      expect(result[3].checked).toBe(true); // Boolean(1) = true
      expect(result[4].checked).toBeUndefined(); // non-checklist => undefined
    });

    it("empty array fallback to blocksFromContent", () => {
      const result = normalizeBlocks([], "fallback content");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("fallback content");
      expect(result[0].type).toBe("paragraph");
    });

    it("array with only invalid items fallback to blocksFromContent", () => {
      const result = normalizeBlocks([null, 42, "bad"] as unknown as [], "fallback");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("fallback");
    });

    it("id generation when missing", () => {
      const result = normalizeBlocks([{ type: "paragraph", text: "hi" }], "");
      expect(typeof result[0].id).toBe("string");
      expect(result[0].id.length).toBeGreaterThan(0);
    });

    it("preserves existing string id", () => {
      const result = normalizeBlocks([{ id: "my-id", type: "paragraph", text: "hi" }], "");
      expect(result[0].id).toBe("my-id");
    });

    it("generates id when id is not string", () => {
      const result = normalizeBlocks([{ id: 123 as unknown as string, type: "paragraph", text: "hi" }], "");
      expect(typeof result[0].id).toBe("string");
      expect(result[0].id).not.toBe("123");
    });

    it("text coercion when not string returns empty string", () => {
      const result = normalizeBlocks(
        [
          { id: "1", type: "paragraph", text: 123 as unknown as string },
          { id: "2", type: "paragraph", text: null as unknown as string },
          { id: "3", type: "paragraph", text: undefined as unknown as string },
        ],
        ""
      );
      expect(result[0].text).toBe("");
      expect(result[1].text).toBe("");
      expect(result[2].text).toBe("");
    });

    it("keeps text when string", () => {
      const result = normalizeBlocks([{ id: "1", type: "paragraph", text: "hello" }], "");
      expect(result[0].text).toBe("hello");
    });
  });

  describe("blocksFromContent", () => {
    it("returns single paragraph block with given content", () => {
      const blocks = blocksFromContent("hello world");
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("paragraph");
      expect(blocks[0].text).toBe("hello world");
      expect(typeof blocks[0].id).toBe("string");
    });

    it("handles empty content", () => {
      const blocks = blocksFromContent("");
      expect(blocks[0].text).toBe("");
    });
  });

  describe("plainTextFromBlocks / contentFromBlocks", () => {
    it("joins with \\n, trims, filters empty", () => {
      const blocks = [
        { id: "1", type: "paragraph" as const, text: "  hello  " },
        { id: "2", type: "paragraph" as const, text: "   " },
        { id: "3", type: "paragraph" as const, text: "world" },
        { id: "4", type: "paragraph" as const, text: "" },
      ];
      expect(plainTextFromBlocks(blocks)).toBe("hello\nworld");
    });

    it("contentFromBlocks slices to MAX_NOTE_CONTENT_LENGTH", () => {
      const longText = "a".repeat(3000);
      const blocks = [{ id: "1", type: "paragraph" as const, text: longText }];
      const content = contentFromBlocks(blocks);
      expect(content.length).toBe(MAX_NOTE_CONTENT_LENGTH);
      expect(content).toBe("a".repeat(2000));
    });

    it("contentFromBlocks truncation across multiple blocks joined", () => {
      const text1 = "a".repeat(1500);
      const text2 = "b".repeat(1000);
      const blocks = [
        { id: "1", type: "paragraph" as const, text: text1 },
        { id: "2", type: "paragraph" as const, text: text2 },
      ];
      const content = contentFromBlocks(blocks);
      expect(content.length).toBe(MAX_NOTE_CONTENT_LENGTH);
      // Should be 1500 a's + "\n" + 499 b's = 2000
      expect(content).toBe("a".repeat(1500) + "\n" + "b".repeat(499));
    });

    it("returns empty string for empty blocks", () => {
      expect(plainTextFromBlocks([])).toBe("");
      expect(contentFromBlocks([])).toBe("");
    });

    it("filters blocks with whitespace only", () => {
      const blocks = [
        { id: "1", type: "paragraph" as const, text: "   " },
        { id: "2", type: "paragraph" as const, text: "\n\t" },
      ];
      expect(plainTextFromBlocks(blocks)).toBe("");
    });
  });

  describe("isAllowedAttachment", () => {
    it("enforces size limit: rejects oversized for LOCAL limit", () => {
      const file = { name: "photo.jpg", type: "image/jpeg", size: LOCAL_ATTACHMENT_LIMIT + 1 };
      expect(isAllowedAttachment(file, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
    });

    it("enforces size limit: allows within LOCAL limit", () => {
      const file = { name: "photo.jpg", type: "image/jpeg", size: LOCAL_ATTACHMENT_LIMIT };
      expect(isAllowedAttachment(file, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("enforces size limit: REMOTE allows larger than LOCAL but rejects over REMOTE", () => {
      const sizeOverLocalUnderRemote = LOCAL_ATTACHMENT_LIMIT + 100;
      const file = { name: "doc.pdf", type: "application/pdf", size: sizeOverLocalUnderRemote };
      expect(isAllowedAttachment(file, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
      expect(isAllowedAttachment(file, REMOTE_ATTACHMENT_LIMIT)).toBe(true);
      const oversizedRemote = { name: "doc.pdf", type: "application/pdf", size: REMOTE_ATTACHMENT_LIMIT + 1 };
      expect(isAllowedAttachment(oversizedRemote, REMOTE_ATTACHMENT_LIMIT)).toBe(false);
    });

    it("mime prefix matching image/*", () => {
      expect(isAllowedAttachment({ name: "img.png", type: "image/png", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "img.webp", type: "image/webp", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "img.jpeg", type: "image/jpeg", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("exact mime matching application/pdf", () => {
      expect(isAllowedAttachment({ name: "file.pdf", type: "application/pdf", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("exact mime matching text/plain and text/csv", () => {
      expect(isAllowedAttachment({ name: "note.txt", type: "text/plain", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "data.csv", type: "text/csv", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("exact mime for office docs", () => {
      expect(
        isAllowedAttachment({ name: "doc.doc", type: "application/msword", size: 100 }, LOCAL_ATTACHMENT_LIMIT)
      ).toBe(true);
      expect(
        isAllowedAttachment(
          { name: "doc.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100 },
          LOCAL_ATTACHMENT_LIMIT
        )
      ).toBe(true);
    });

    it("extension fallback when mime type empty but extension allowed", () => {
      expect(isAllowedAttachment({ name: "file.docx", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "file.pdf", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "file.xlsx", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("extension fallback allowed extensions list", () => {
      const allowed = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "txt", "csv"];
      for (const ext of allowed) {
        expect(isAllowedAttachment({ name: `file.${ext}`, type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      }
    });

    it("rejects unknown extension/mime", () => {
      expect(isAllowedAttachment({ name: "file.exe", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
      expect(isAllowedAttachment({ name: "file.exe", type: "application/octet-stream", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
      expect(isAllowedAttachment({ name: "archive.zip", type: "application/zip", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
    });

    it("rejects unknown mime with no extension fallback", () => {
      expect(isAllowedAttachment({ name: "file.unknown", type: "application/unknown", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
    });

    it("case-insensitive extension", () => {
      expect(isAllowedAttachment({ name: "file.PDF", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "file.DOCX", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
      expect(isAllowedAttachment({ name: "file.Pdf", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("extension check is case-insensitive with mixed mime", () => {
      expect(isAllowedAttachment({ name: "IMAGE.JPG", type: "", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(false); // jpg not in allowedExtension list, needs mime
      // But image mime passes regardless of extension
      expect(isAllowedAttachment({ name: "IMAGE.JPG", type: "image/jpeg", size: 100 }, LOCAL_ATTACHMENT_LIMIT)).toBe(true);
    });

    it("rejects oversized even with allowed mime", () => {
      expect(isAllowedAttachment({ name: "big.pdf", type: "application/pdf", size: REMOTE_ATTACHMENT_LIMIT + 1 }, REMOTE_ATTACHMENT_LIMIT)).toBe(false);
    });

    it("rejects oversized even with allowed extension fallback", () => {
      expect(isAllowedAttachment({ name: "big.pdf", type: "", size: LOCAL_ATTACHMENT_LIMIT + 1 }, LOCAL_ATTACHMENT_LIMIT)).toBe(false);
    });
  });
});
