import { describe, expect, it } from "vitest";
import { emptyContentJson, extractPlainText, parseContent } from "@/lib/tiptapContent";

describe("tiptapContent", () => {
  it("parseContent returns valid TipTap JSON as-is", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi" }],
        },
      ],
    };

    expect(parseContent(JSON.stringify(doc))).toEqual(doc);
  });

  it("parseContent wraps non-JSON plain text as a single-paragraph doc", () => {
    expect(parseContent("just some text")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "just some text" }],
        },
      ],
    });
  });

  it("parseContent returns an empty doc for empty content", () => {
    expect(parseContent("")).toEqual({ type: "doc", content: [] });
  });

  it("extractPlainText returns the joined text of a multi-node TipTap doc with no JSON syntax visible", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title text" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body text", marks: [{ type: "bold" }] }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "List item one" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const plainText = extractPlainText(content);

    expect(plainText).toBe("Title text Body text List item one");
    expect(plainText).not.toContain("{");
    expect(plainText).not.toContain("}");
    expect(plainText).not.toContain("\"type\"");
  });

  it("emptyContentJson returns an empty doc as JSON", () => {
    expect(JSON.parse(emptyContentJson())).toEqual({ type: "doc", content: [] });
  });
});
