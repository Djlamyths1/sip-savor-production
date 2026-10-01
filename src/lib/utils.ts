export function formatCurrency(value: number): string {
  const amount = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);

  return String.fromCharCode(0x20A6) + amount;
}
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateInput(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  return dateStr;
}

export function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export type PeriodPreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export function getDateRange(preset: PeriodPreset, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  switch (preset) {
    case 'today':
      return { start: fmt(today), end: fmt(today) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: fmt(y), end: fmt(y) };
    }
    case 'this_week': {
      const start = new Date(today);
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      return { start: fmt(start), end: fmt(today) };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmt(start), end: fmt(today) };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case 'custom':
      return { start: customStart || fmt(today), end: customEnd || fmt(today) };
    default:
      return { start: fmt(today), end: fmt(today) };
  }
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]): void {
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colLetter = (i: number) => String.fromCharCode(65 + i);
  const headerRow = `<Row>${headers.map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>`;
  const dataRows = rows.map((r) => {
    const cells = r.map((c, i) => {
      if (typeof c === 'number') {
        return `<Cell ss:StyleID="DataNumber"><Data ss:Type="Number">${c}</Data></Cell>`;
      }
      return `<Cell ss:StyleID="DataText"><Data ss:Type="String">${escapeXml(String(c))}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#F5F5F0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="DataText"/>
  <Style ss:ID="DataNumber"><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
   ${headerRow}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : filename + '.xls';
  a.click();
  URL.revokeObjectURL(url);
}

export function printReport(title: string, dateRange: string, headers: string[], rows: (string | number)[][], summary?: { label: string; value: string }[]): void {
  const businessName = "Sip 'n' Savor";
  const businessAddress = 'Beverage Production &amp; Sales';
  const phone = '';
  const genDate = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const tableRows = rows.map((r) => {
    const cells = r.map((c) => `<td>${String(c ?? '')}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');

  const summaryHTML = summary && summary.length > 0
    ? `<div class="summary"><h3>Summary</h3>${summary.map((s) => `<div class="summary-row"><span>${s.label}:</span><span>${s.value}</span></div>`).join('')}</div>`
    : '';

  const html = `<!DOCTYPE html><html><head><title>${title}</title><style>
  *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px;color:#1c1917}
  .header{text-align:center;margin-bottom:24px}.header h1{font-size:22px;font-weight:bold}
  .header p{font-size:12px;color:#78716c;margin-top:2px}
  .meta{display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px;color:#57534e}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#f5f5f0;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e7e5e4}
  td{padding:8px 10px;border-bottom:1px solid #f5f5f4;font-size:12px}
  tr:nth-child(even){background:#fafaf9}
  .summary{margin-top:20px}.summary h3{font-size:14px;margin-bottom:8px}
  .summary-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid #f5f5f4}
  @media print{body{padding:15px}}
  </style></head><body>
  <div class="header"><h1>${businessName}</h1><p>${businessAddress}</p>${phone ? `<p>${phone}</p>` : ''}</div>
  <div class="meta"><span><strong>${title}</strong></span><span>Period: ${dateRange}</span><span>Generated: ${genDate}</span></div>
  <table><thead><tr>${headerCells}</tr></thead><tbody>${tableRows}</tbody></table>
  ${summaryHTML}
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }
}

