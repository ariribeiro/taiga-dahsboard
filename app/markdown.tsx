"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown do Taiga renderizado como elementos React (sem HTML bruto, então não há injeção de HTML). */
export function Md({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
