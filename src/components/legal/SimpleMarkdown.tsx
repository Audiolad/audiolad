// Minimal, dependency-free markdown renderer for trusted repo documents (headings, quotes, lists, tables,
// paragraphs, **bold**, `code`). Never renders raw HTML.
import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== "");
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={key} className="rounded bg-[#f3eefb] px-1">{p.slice(1, -1)}</code>;
    return p;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function SimpleMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (line.trim() === "") { i += 1; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "mt-6 text-[26px] font-semibold leading-tight" : "mt-6 text-[19px] font-semibold leading-tight";
      out.push(level === 1 ? <h1 key={k} className={cls}>{inline(h[2], k)}</h1> : <h2 key={k} className={cls}>{inline(h[2], k)}</h2>);
      i += 1; continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) { buf.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      out.push(<blockquote key={k} className="mt-4 border-l-4 border-[#d9c9f2] pl-4 italic">{inline(buf.join(" "), k)}</blockquote>);
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i]); i += 1; }
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      const [head, ...rest] = body;
      out.push(
        <div key={k} className="mt-4 overflow-x-auto"><table className="min-w-full border-collapse text-sm">
          <thead><tr>{cells(head).map((c, j) => <th key={j} className="border border-[#eadff8] p-2 text-left">{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
          <tbody>{rest.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j} className="border border-[#eadff8] p-2 align-top">{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    const isItem = (s: string) => /^\s*(\d+\.|[-*])\s+/.test(s);
    if (isItem(line)) {
      const items: { indent: boolean; text: string }[] = [];
      while (i < lines.length && lines[i].trim() !== "" && (isItem(lines[i]) || /^\s+/.test(lines[i]))) {
        const raw = lines[i];
        if (isItem(raw)) items.push({ indent: /^\s+/.test(raw), text: raw.trim() });
        else if (items.length) items[items.length - 1].text += ` ${raw.trim()}`;
        i += 1;
      }
      out.push(<ul key={k} className="mt-3 space-y-2">{items.map((it, j) => (
        <li key={j} className={it.indent ? "ml-6" : undefined}>{inline(it.text.replace(/^[-*]\s+/, "• "), `${k}i${j}`)}</li>
      ))}</ul>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|>|\s*\|)/.test(lines[i]) && !isItem(lines[i])) { buf.push(lines[i]); i += 1; }
    out.push(<p key={k} className="mt-3">{buf.flatMap((b, j) => (j ? [<br key={`${k}br${j}`} />, ...inline(b, `${k}l${j}`)] : inline(b, `${k}l${j}`)))}</p>);
  }
  return <div className="text-[15px] leading-7 text-[#4c3d78]">{out}</div>;
}
