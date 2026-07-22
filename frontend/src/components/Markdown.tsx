import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'

/* ── 全局共享 Markdown 组件映射 ── */

export const MD: Record<string, React.FC<any>> = {
  h1: ({ children }: any) => (
    <h1 className="text-lg font-display font-semibold text-text mt-6 mb-3 first:mt-0 border-b border-border pb-2">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-base font-display font-semibold text-text mt-5 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-semibold text-text mt-4 mb-1.5 first:mt-0">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="text-text-secondary leading-relaxed">{children}</li>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-text-secondary">{children}</em>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener" className="text-accent underline underline-offset-2 hover:text-accent-glow">{children}</a>
  ),
  code: ({ className, children }: any) =>
    className
      ? <code className="text-sm font-mono text-text">{children}</code>
      : <code className="bg-accent/8 text-accent px-1.5 py-0.5 rounded-md text-xs font-mono">{children}</code>,
  pre: ({ children }: any) => <CodeBlock>{children}</CodeBlock>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-[3px] border-accent/30 pl-4 my-3 text-text-secondary italic leading-relaxed">{children}</blockquote>
  ),
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-4"><table className="w-full text-sm border-collapse">{children}</table></div>
  ),
  th: ({ children }: any) => (
    <th className="border border-border px-4 py-2 text-left font-semibold text-text bg-surface first:rounded-tl-xl last:rounded-tr-xl">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-border px-4 py-2 text-text-secondary">{children}</td>
  ),
}

/* ── 代码块（含复制按钮）── */

function extractText(children: any): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (children?.props?.children) return extractText(children.props.children)
  return ''
}

function CodeBlock({ children }: any) {
  const [copied, setCopied] = useState(false)
  const text = extractText(children)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }, [text])
  return (
    <div className="relative group mb-4">
      <pre className="bg-page border border-border rounded-2xl p-5 pt-10 overflow-x-auto text-sm font-mono text-text leading-relaxed">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text hover:bg-accent/8 opacity-0 group-hover:opacity-100 transition-all"
        title="复制代码"
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      </button>
    </div>
  )
}
