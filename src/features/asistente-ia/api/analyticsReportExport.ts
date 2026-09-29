import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { strToU8, zipSync } from "fflate";
import type { AssistantAnalysisReport } from "./assistantAnalyticsApi";

type Cell = string | number;
type ReportTable = { title: string; headers: string[]; rows: Cell[][]; metrics: Array<[string, number]>; context: string[] };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function groupLabel(groupBy: string): string {
  const labels: Record<string, string> = {
    dia: "día",
    producto: "producto",
    categoria: "categoría",
    metodo_pago: "medio de pago",
    sucursal: "sucursal",
  };
  return labels[groupBy] ?? groupBy;
}

function reportTable(report: AssistantAnalysisReport): ReportTable {
  const { analysis } = report;
  if (analysis.dataset === "sales") {
    return {
      title: `Ventas agrupadas por ${groupLabel(analysis.group_by)}`,
      headers: [groupLabel(analysis.group_by), "Ingresos (Bs)", "Transacciones", "Unidades", "Ticket promedio (Bs)"],
      rows: analysis.rows.map((row) => [row.key, row.revenue, row.transactions, row.units, row.average_ticket]),
      metrics: [
        ["Ingresos totales (Bs)", analysis.summary.revenue],
        ["Transacciones", analysis.summary.transactions],
        ["Unidades", analysis.summary.units],
        ["Ticket promedio (Bs)", analysis.summary.average_ticket],
        ...(analysis.previous_summary ? [["Ingresos período anterior (Bs)", analysis.previous_summary.revenue] as [string, number]] : []),
      ],
      context: [`Período: ${analysis.from} a ${analysis.to}`, `Agrupación: ${groupLabel(analysis.group_by)}`, `Sucursal: ${report.scopeLabel}`, "Los indicadores resumen cubren el filtro completo; el detalle contiene hasta 20 grupos devueltos."],
    };
  }
  return {
    title: `Inventario agrupado por ${groupLabel(analysis.group_by)}`,
    headers: [groupLabel(analysis.group_by), "Productos", "Unidades en stock", "Valor a precio de catálogo (Bs)", "Bajo mínimo"],
    rows: analysis.rows.map((row) => [row.key, row.products, row.stock_units, row.estimated_value, row.below_minimum]),
    metrics: [
      ["Unidades en stock", analysis.summary.stock_units],
      ["Productos", analysis.summary.products],
      ["Productos bajo mínimo", analysis.summary.below_minimum],
      ["Valor a precio de catálogo (Bs)", analysis.summary.estimated_value],
    ],
    context: ["Período: existencias actuales", `Agrupación: ${groupLabel(analysis.group_by)}`, `Sucursal: ${report.scopeLabel}`, "Los indicadores resumen cubren el filtro completo; el detalle contiene hasta 20 grupos devueltos."],
  };
}

function cleanXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function worksheetCell(value: Cell, reference: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${cleanXml(String(value))}</t></is></c>`;
}

function worksheetXml(rows: Cell[][]): string {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => worksheetCell(cell, `${columnName(columnIndex)}${rowIndex + 1}`)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function excelRows(table: ReportTable, conclusion: string): Cell[][] {
  return [
    [table.title],
    ["Generado por Lidemoda · Asistente de inventario"],
    ...table.context.map((item) => [item]),
    ["Conclusión del asistente", conclusion],
    [""],
    ["Indicadores"],
    ["Indicador", "Valor"],
    ...table.metrics,
    [""],
    ["Detalle"],
    table.headers,
    ...table.rows,
  ];
}

function buildXlsx(reports: AssistantAnalysisReport[], conclusion: string): Uint8Array {
  const tables = reports.map(reportTable);
  const sheetNames = tables.map((table, index) => `${table.title.startsWith("Ventas") ? "Ventas" : "Stock"} ${index + 1}`);
  const workbookSheets = sheetNames.map((name, index) => `<sheet name="${cleanXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const relationships = sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const overrides = sheetNames.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`),
  };
  tables.forEach((table, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(excelRows(table, conclusion)));
  });
  return zipSync(entries, { level: 6 });
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPdfHtml(reports: AssistantAnalysisReport[], conclusion: string): string {
  const sections = reports.map((report) => {
    const table = reportTable(report);
    const chartPoints = report.analysis.dataset === "sales"
      ? report.analysis.rows.slice(0, 8).map((row) => ({ label: row.key, value: row.revenue }))
      : report.analysis.rows.slice(0, 8).map((row) => ({ label: row.key, value: row.stock_units }));
    const chartMax = Math.max(0, ...chartPoints.map((point) => point.value));
    const chartRows = chartPoints.map((point) => {
      const width = chartMax > 0 ? Math.max(2, (point.value / chartMax) * 100) : 0;
      const amount = report.analysis.dataset === "sales"
        ? `Bs. ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(point.value)}`
        : `${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 }).format(point.value)} uds`;
      return `<div class="chart-row"><span>${htmlEscape(point.label)}</span><div class="track"><div class="bar" style="width:${width}%"></div></div><strong>${amount}</strong></div>`;
    }).join("");
    const summaryRows = table.metrics.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value)}</td></tr>`).join("");
    const detailRows = table.rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(String(cell))}</td>`).join("")}</tr>`).join("");
    const header = table.headers.map((cell) => `<th>${htmlEscape(cell)}</th>`).join("");
    return `<section><h2>${htmlEscape(table.title)}</h2><p>${table.context.map(htmlEscape).join(" · ")}</p><table class="summary"><tbody>${summaryRows}</tbody></table><div class="chart">${chartRows || `<p>Sin filas para graficar.</p>`}</div><table><thead><tr>${header}</tr></thead><tbody>${detailRows || `<tr><td colspan="${table.headers.length}">Sin filas para los filtros elegidos.</td></tr>`}</tbody></table></section>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
    @page{margin:18mm}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:11px}h1{font-size:23px;color:#28386b;margin-bottom:4px}h2{font-size:16px;color:#28386b;margin:22px 0 6px}p{color:#586174;line-height:1.5}.intro{padding:12px;background:#f2f4fb;border-radius:8px}.chart{margin:12px 0 18px}.chart-row{display:grid;grid-template-columns:22% 1fr 24%;gap:8px;align-items:center;margin:7px 0}.chart-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chart-row strong{text-align:right}.track{height:10px;background:#ffedd5;border-radius:8px;overflow:hidden}.bar{height:100%;background:#f97316;border-radius:8px}table{width:100%;border-collapse:collapse;margin:10px 0 18px;page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}th,td{padding:7px;border:1px solid #d9deea;text-align:left}thead th{background:#edf0f8;color:#28386b}th{font-weight:700}.summary th{width:55%;background:#f8f9fc}section{page-break-inside:avoid}
    </style></head><body><h1>Informe analítico de inventario</h1><p>Generado por Lidemoda · ${htmlEscape(new Intl.DateTimeFormat("es-BO", { dateStyle: "long", timeZone: "America/La_Paz" }).format(new Date()))}</p><div class="intro"><strong>Conclusión del asistente</strong><p>${htmlEscape(conclusion || "Análisis basado en los datos consultados en Supabase.")}</p></div>${sections}</body></html>`;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function shareNativeFile(uri: string, fileName: string, mimeType: string, uti: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("El dispositivo no tiene una aplicación disponible para compartir el archivo.");
  }
  await Sharing.shareAsync(uri, { dialogTitle: fileName, mimeType, UTI: uti });
}

export async function compartirInformeExcel(reports: AssistantAnalysisReport[], conclusion: string): Promise<void> {
  if (reports.length === 0) throw new Error("No hay datos analíticos para exportar.");
  const fileName = `lidemoda-analisis-${timestamp()}.xlsx`;
  const bytes = buildXlsx(reports, conclusion);
  if (Platform.OS === "web") {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      throw new Error("El navegador no permite descargar este archivo en este momento.");
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(bytes);
  await shareNativeFile(file.uri, fileName, XLSX_MIME, "org.openxmlformats.spreadsheetml.sheet");
}

export async function compartirInformePdf(reports: AssistantAnalysisReport[], conclusion: string): Promise<void> {
  if (reports.length === 0) throw new Error("No hay datos analíticos para exportar.");
  const html = buildPdfHtml(reports, conclusion);
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const fileName = `lidemoda-informe-${timestamp()}.pdf`;
  await shareNativeFile(uri, fileName, "application/pdf", "com.adobe.pdf");
}
