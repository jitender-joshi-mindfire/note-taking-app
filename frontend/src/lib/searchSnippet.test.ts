import { describe, expect, it } from "vitest";
import { parseSnippet } from "@/lib/searchSnippet";

describe("searchSnippet", () => {
  it("parseSnippet returns a single unhighlighted segment for plain text with no <mark> tags", () => {
    expect(parseSnippet("just plain text")).toEqual([
      { text: "just plain text", highlighted: false },
    ]);
  });

  it("parseSnippet extracts a <mark>-wrapped segment as highlighted, correctly interleaved with the surrounding plain-text segments", () => {
    expect(parseSnippet("before <mark>match</mark> after")).toEqual([
      { text: "before ", highlighted: false },
      { text: "match", highlighted: true },
      { text: " after", highlighted: false },
    ]);
  });

  it("parseSnippet handles multiple separate highlighted segments in one snippet", () => {
    expect(parseSnippet("<mark>one</mark> and <mark>two</mark>")).toEqual([
      { text: "one", highlighted: true },
      { text: " and ", highlighted: false },
      { text: "two", highlighted: true },
    ]);

    // A <mark> at the very start or end must not produce a spurious empty
    // leading/trailing plain-text segment.
    expect(parseSnippet("<mark>start</mark> rest")).toEqual([
      { text: "start", highlighted: true },
      { text: " rest", highlighted: false },
    ]);
    expect(parseSnippet("rest <mark>end</mark>")).toEqual([
      { text: "rest ", highlighted: false },
      { text: "end", highlighted: true },
    ]);
  });
});
