import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => (
  <div className={`markdown-content ${className}`}>
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeSanitize]}
    components={{
      h1: ({ children }) => <h1 className="mb-3 mt-6 text-headline-lg text-on-surface">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-2 mt-5 border-b border-outline-variant/30 pb-2 text-headline-md text-on-surface">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-2 mt-4 text-headline-sm text-on-surface">{children}</h3>,
      p: ({ children }) => <p className="my-2 text-body-md leading-7 text-on-surface">{children}</p>,
      ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1 text-on-surface">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1 text-on-surface">{children}</ol>,
      blockquote: ({ children }) => <blockquote className="my-3 rounded-r-lg border-l-2 border-primary bg-primary/5 py-1 pl-4 italic text-on-surface-variant">{children}</blockquote>,
      code: ({ className: codeClassName, children }) => {
        const block = codeClassName?.startsWith('language-');
        if (block) {
          return <code className="block font-mono text-[13px] leading-5 text-slate-100">{children}</code>;
        }
        return <code className="rounded border border-outline-variant/40 bg-surface-container-high px-1.5 py-0.5 font-mono text-[13px] text-primary">{children}</code>;
      },
      pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-900 p-4">{children}</pre>,
      table: ({ children }) => <div className="my-4 overflow-x-auto rounded-lg border border-outline-variant/50"><table className="w-full border-collapse text-[13px]">{children}</table></div>,
      th: ({ children }) => <th className="border-b border-outline-variant/50 bg-surface-container-low px-3 py-2 text-left font-semibold text-on-surface">{children}</th>,
      td: ({ children }) => <td className="border-b border-outline-variant/20 px-3 py-2 align-top text-on-surface">{children}</td>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">{children}</a>
    }}
  >
    {content}
  </ReactMarkdown>
  </div>
);
