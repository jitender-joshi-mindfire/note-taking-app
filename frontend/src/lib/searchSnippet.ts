export interface SnippetSegment {
  text: string;
  highlighted: boolean;
}

const MARK_PATTERN = /(<mark>.*?<\/mark>)/g;
const MARK_WRAPPER = /^<mark>(.*)<\/mark>$/;

export function parseSnippet(snippet: string): SnippetSegment[] {
  return snippet
    .split(MARK_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = part.match(MARK_WRAPPER);
      return match
        ? { text: match[1] ?? "", highlighted: true }
        : { text: part, highlighted: false };
    });
}
