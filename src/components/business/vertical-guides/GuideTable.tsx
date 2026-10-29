import type { GuideTable as GuideTableData } from "@/lib/business/vertical-guides/types";

import { GuideParagraphs } from "./GuideSections";

/**
 * Article table. Under 600 px every row becomes a card: the first cell is the card heading,
 * the other cells follow with their column name as a small label (no horizontal scroll).
 */
export default function GuideTable({ table }: { table: GuideTableData }) {
  return (
    <section className="guide-wrap guide-block guide-prose" aria-labelledby={table.id}>
      <h2 id={table.id} className="guide-display guide-h2">
        {table.heading}
      </h2>
      <GuideParagraphs paragraphs={table.intro} keyPrefix={`${table.id}-intro`} />
      <div className="guide-table__scroll" role="region" aria-labelledby={table.id} tabIndex={0}>
        <table className="guide-table">
          <caption className="guide-sr">{table.caption}</caption>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) =>
                  index === 0 ? (
                    <th key={cell} scope="row" data-label={table.columns[0]}>
                      {cell}
                    </th>
                  ) : (
                    <td key={`${row[0]}-${index}`} data-label={table.columns[index]}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GuideParagraphs paragraphs={table.after} keyPrefix={`${table.id}-after`} />
    </section>
  );
}
