/*
 * Inline styles for clipboard HTML so formatting is preserved when pasting into editors (e.g. Microsoft Word).
 * These styles mirror the ones defined in Answer.module.css.
 */

const CLIPBOARD_STYLES: Record<string, string> = {
    h1: 'font-size:24px; font-weight:600; line-height:32px; margin:24px 0 16px 0; color:#323130; border-bottom:1px solid #e1e1e1; padding-bottom:8px;',
    h2: 'font-size:20px; font-weight:600; line-height:28px; margin:20px 0 12px 0; color:#323130; border-bottom:1px solid #f3f2f1; padding-bottom:6px;',
    h3: 'font-size:18px; font-weight:600; line-height:24px; margin:16px 0 8px 0; color:#323130;',
    h4: 'font-size:16px; font-weight:600; line-height:22px; margin:14px 0 8px 0; color:#323130;',
    h5: 'font-size:14px; font-weight:600; line-height:20px; margin:12px 0 6px 0; color:#323130;',
    h6: 'font-size:14px; font-weight:600; line-height:20px; margin:12px 0 6px 0; color:#605e5c;',
    p: 'margin:12px 0; line-height:20px;',
    table: 'border-collapse:collapse; width:100%; margin:16px 0; border:1px solid #d1d1d1;',
    th: 'border:1px solid #d1d1d1; padding:8px 12px; text-align:left; background-color:#f3f2f1; font-weight:600; color:#323130;',
    td: 'border:1px solid #d1d1d1; padding:8px 12px; text-align:left;',
    blockquote: 'border-left:4px solid #d1d1d1; padding:8px 16px; margin:16px 0; background-color:#f9f9f9; color:#605e5c; font-style:italic;',
    pre: "background-color:#f5f5f5; border:1px solid #d1d1d1; border-radius:4px; padding:12px; margin:16px 0; font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; line-height:18px;",
    code: "background-color:#f5f5f5; border:1px solid #e1e1e1; border-radius:3px; padding:2px 6px; font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; color:#000000;",
    ul: 'margin:12px 0; padding-left:24px; list-style-type:disc;',
    ol: 'margin:12px 0; padding-left:24px; list-style-type:decimal;',
    li: 'margin:6px 0; line-height:20px;',
    a: 'color:#115ea3; text-decoration:none;',
    hr: 'border:none; border-top:1px solid #d1d1d1; margin:20px 0;',
    strong: 'font-weight:600; color:#323130;',
    em: 'font-style:italic;',
    del: 'text-decoration:line-through; color:#605e5c;',
    sup: 'font-size:10px; line-height:10px;',
};

const CODE_INSIDE_PRE_STYLE = 'background-color:transparent; padding:0; border:none; font-size:13px;';
const EVEN_ROW_STYLE = 'background-color:#faf9f8;';

function getNestingDepth(element: Element, tagNames: string[]): number {
    let depth = 0;
    let current = element.parentElement;
    while (current) {
        if (tagNames.includes(current.tagName.toLowerCase())) {
            depth++;
        }
        current = current.parentElement;
    }
    return depth;
}

function walkAndStyle(element: Element): void {
    const tag = element.tagName.toLowerCase();
    let style = CLIPBOARD_STYLES[tag] || '';

    // Code inside pre blocks: transparent background, no border
    if (tag === 'code' && element.parentElement?.tagName.toLowerCase() === 'pre') {
        style = CODE_INSIDE_PRE_STYLE;
    }

    // Zebra striping for table rows (Word doesn't support :nth-child)
    if (tag === 'tr' && element.parentElement) {
        const rows = Array.from(element.parentElement.children).filter((child) => child.tagName.toLowerCase() === 'tr');
        const index = rows.indexOf(element);
        if (index % 2 === 1) {
            style = EVEN_ROW_STYLE;
        }
    }

    // Nested list style types (Word doesn't support CSS nesting selectors)
    if (tag === 'ul') {
        const depth = getNestingDepth(element, ['ul', 'ol']);
        if (depth === 1) {
            style += ' list-style-type:circle; margin:4px 0;';
        } else if (depth >= 2) {
            style += ' list-style-type:square; margin:4px 0;';
        }
    }
    if (tag === 'ol') {
        const depth = getNestingDepth(element, ['ul', 'ol']);
        if (depth >= 1) {
            style += ' list-style-type:lower-alpha; margin:4px 0;';
        }
    }

    if (style) {
        element.setAttribute('style', style.trim());
    }

    for (const child of Array.from(element.children)) {
        walkAndStyle(child);
    }
}

export function applyInlineStylesToHtml(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    walkAndStyle(doc.body);
    return doc.body.innerHTML;
}
