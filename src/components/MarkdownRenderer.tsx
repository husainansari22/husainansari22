"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const code = String(children).replace(/\n$/, "");

          if (match) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: "0.75rem 0",
                  borderRadius: "0.75rem",
                  fontSize: "0.85rem",
                }}
              >
                {code}
              </SyntaxHighlighter>
            );
          }

          return (
            <code
              className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-violet-200"
              {...props}
            >
              {children}
            </code>
          );
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>;
        },
        h1({ children }) {
          return <h1 className="mb-3 text-2xl font-bold">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="mb-2 text-xl font-semibold">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="mb-2 text-lg font-semibold">{children}</h3>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="mb-3 border-l-4 border-violet-500/50 pl-4 italic text-zinc-300">
              {children}
            </blockquote>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
