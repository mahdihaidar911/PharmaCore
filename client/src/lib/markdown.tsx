import type { ReactNode } from "react";

/**
 * Renders the small Markdown subset the assistant uses (headings, bullet/numbered lists, bold)
 * as React elements. Model output is never inserted as HTML.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong> : part,
  );
}

export function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key} className="ml-5 list-decimal space-y-1">{items}</ol>
      ) : (
        <ul key={key} className="ml-5 list-disc space-y-1">{items}</ul>
      ),
    );
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <h4 key={`h${blocks.length}`} className="pt-1 font-semibold text-ink">
          {inline(heading[1], `h${blocks.length}`)}
        </h4>,
      );
    } else {
      blocks.push(<p key={`p${blocks.length}`}>{inline(line, `p${blocks.length}`)}</p>);
    }
  }
  flush();

  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
