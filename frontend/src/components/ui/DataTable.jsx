const DataTable = ({ columns, data, emptyMessage = 'No data available' }) => (
  <div className="terminal-card overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-[#080a0f]/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#848e9c] border-b border-[#202532] whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-[11px] text-[#848e9c]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="border-b border-[#202532]/40 hover:bg-[#fcd535]/[0.02] transition-colors duration-150"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-[11px] font-mono text-[#eaecef] whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default DataTable;
