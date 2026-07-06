import type { JSONContent } from "@tiptap/react";

function isDocNode(value: unknown): value is JSONContent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc"
  );
}

export function parseContent(content: string): JSONContent {
  try {
    const parsed: unknown = JSON.parse(content);
    if (isDocNode(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to legacy plain-text wrapping
  }

  return {
    type: "doc",
    content: content ? [{ type: "paragraph", content: [{ type: "text", text: content }] }] : [],
  };
}

function collectText(node: JSONContent, parts: string[]): void {
  if (node.text) {
    parts.push(node.text);
  }
  node.content?.forEach((child) => collectText(child, parts));
}

export function extractPlainText(content: string): string {
  const parts: string[] = [];
  collectText(parseContent(content), parts);
  return parts.join(" ").trim();
}

export function emptyContentJson(): string {
  return JSON.stringify({ type: "doc", content: [] });
}
