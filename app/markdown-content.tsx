"use client";

import type { ReactNode } from "react";

function inlineMarkdown(value: string, keyPrefix: string) {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${index}`}>{token.slice(2, -2)}</strong>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        parts.push(
          <a
            key={`${keyPrefix}-link-${index}`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
          >
            {link[1]}
          </a>,
        );
      }
    }
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (/^---+$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const text = inlineMarkdown(heading[2], `heading-${index}`);
      blocks.push(
        heading[1].length === 1 ? (
          <h2 key={`heading-${index}`}>{text}</h2>
        ) : heading[1].length === 2 ? (
          <h3 key={`heading-${index}`}>{text}</h3>
        ) : (
          <h4 key={`heading-${index}`}>{text}</h4>
        ),
      );
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const item = ordered
          ? candidate.match(/^\d+\.\s+(.+)$/)
          : candidate.match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(
          <li key={`item-${index}`}>
            {inlineMarkdown(item[1], `item-${index}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(
        ordered ? (
          <ol key={`list-${index}`}>{items}</ol>
        ) : (
          <ul key={`list-${index}`}>{items}</ul>
        ),
      );
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (
        !candidate ||
        /^#{1,3}\s+/.test(candidate) ||
        /^---+$/.test(candidate) ||
        /^[-*]\s+/.test(candidate) ||
        /^\d+\.\s+/.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {inlineMarkdown(paragraph.join(" "), `paragraph-${index}`)}
      </p>,
    );
  }
  return <div className="markdown-content">{blocks}</div>;
}
