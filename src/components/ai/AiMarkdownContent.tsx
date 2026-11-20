import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface AiMarkdownContentProps {
  content: string;
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-mono">{language || 'kod'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Nusxalandi' : 'Nusxa olish'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInlineTokens(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Matches: **bold**, `code`, [label](https://...), *italic*
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={keyIdx++} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-mono text-[13px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-500"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={keyIdx++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      nodes.push(token);
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMarkdownBlock(block: string, blockKey: string): React.ReactNode {
  const lines = block.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let elKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      elements.push(<hr key={`${blockKey}_${elKey++}`} className="my-4 border-slate-200 dark:border-slate-800" />);
      i++;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = renderInlineTokens(headingMatch[2]);
      if (level === 1) {
        elements.push(
          <h2 key={`${blockKey}_${elKey++}`} className="text-lg font-bold text-slate-900 dark:text-white mt-4 mb-2">
            {headingText}
          </h2>
        );
      } else if (level === 2) {
        elements.push(
          <h3 key={`${blockKey}_${elKey++}`} className="text-base font-semibold text-slate-900 dark:text-white mt-3.5 mb-1.5">
            {headingText}
          </h3>
        );
      } else {
        elements.push(
          <h4 key={`${blockKey}_${elKey++}`} className="text-sm font-semibold text-slate-900 dark:text-white mt-3 mb-1">
            {headingText}
          </h4>
        );
      }
      i++;
      continue;
    }

    // Table detection
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1].trim())) {
      const parseRow = (r: string) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(trimmed);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      elements.push(
        <div key={`${blockKey}_${elKey++}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200">
              <tr>
                {headers.map((h, idx) => (
                  <th key={idx} className="px-3 py-2 font-semibold border-b border-slate-200 dark:border-slate-800">
                    {renderInlineTokens(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {renderInlineTokens(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, '').trim());
        i++;
      }
      elements.push(
        <ul key={`${blockKey}_${elKey++}`} className="my-2 space-y-1.5 pl-5 list-disc marker:text-emerald-500">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineTokens(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '').trim());
        i++;
      }
      elements.push(
        <ol key={`${blockKey}_${elKey++}`} className="my-2 space-y-1.5 pl-5 list-decimal marker:text-emerald-600 marker:font-semibold">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineTokens(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote (clean framed container, no thick left bar)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote
          key={`${blockKey}_${elKey++}`}
          className="my-2.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm"
        >
          {renderInlineTokens(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|[-*•]\s+|\d+[.)]\s+|>\s?|---+$|\|)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={`${blockKey}_${elKey++}`} className="my-2 leading-[1.65]">
          {renderInlineTokens(paraLines.join(' '))}
        </p>
      );
    }
  }

  return elements;
}

export const AiMarkdownContent: React.FC<AiMarkdownContentProps> = ({ content }) => {
  if (!content) return null;

  // Split around fenced code blocks ```lang ... ```
  const segments: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', language: match[1] || 'kod', content: match[2].replace(/\n$/, '') });
    lastIndex = fenceRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return (
    <div className="text-[15px] text-slate-800 dark:text-slate-200 break-words">
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <CodeBlock key={`code_${idx}`} language={seg.language || 'kod'} code={seg.content} />
        ) : (
          <React.Fragment key={`txt_${idx}`}>{renderMarkdownBlock(seg.content, `b_${idx}`)}</React.Fragment>
        )
      )}
    </div>
  );
};
