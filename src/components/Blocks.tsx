import type { Block } from '../content/schema';

/** React escapes every string. Study content never becomes HTML. */
export function Blocks({ blocks = [] }: { blocks?: Block[] }) {
  return <div className="content-blocks">{blocks.map((block, index) => {
    if (block.type === 'paragraph') return <p key={index} className={block.emphasis ? 'instruction-callout' : undefined}>{block.emphasis ? <strong>{block.text}</strong> : block.text}</p>;
    if (block.type === 'bullet-list') return <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
    return <div className="table-scroll" key={index}><table><thead><tr>{block.columns.map((column, i) => <th scope="col" key={i}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}</tbody></table></div>;
  })}</div>;
}
