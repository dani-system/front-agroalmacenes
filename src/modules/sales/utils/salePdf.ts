import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Client, Company, Product, Sale } from '../../../shared/types';

(pdfMake as any).vfs = (pdfFonts as any).vfs || (pdfFonts as any).pdfMake?.vfs;

const BRAND_GREEN = '#16a34a';
const BRAND_GREEN_DARK = '#166534';
const LIGHT_GREEN = '#f0fdf4';
const BORDER_GRAY = '#cbd5e1';

export interface SalePdfParams {
  sale: Sale;
  companies: Company[];
  client?: Client;
  products: Product[];
}

const money = (value: number) => `S/ ${value.toFixed(2)}`;

const formatDate = (value: string) => new Date(value).toLocaleString('es-PE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Lima',
});

const getDocumentLabel = (voucherType: string) => {
  if (voucherType === 'BOLETA') return 'BOLETA DE VENTA';
  if (voucherType === 'FACTURA') return 'FACTURA';
  return 'NOTA DE VENTA';
};

function buildDocDefinition({ sale, companies, client, products }: SalePdfParams) {
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const itemCompanyIds = [...new Set(sale.items.map((item) => item.companyId))];
  const issuer = sale.companyId
    ? companyById.get(sale.companyId)
    : itemCompanyIds.length === 1
      ? companyById.get(itemCompanyIds[0])
      : undefined;
  const hasMultipleIssuers = itemCompanyIds.length > 1;

  const baseAmount = sale.items.reduce((sum, item) => {
    const taxType = productById.get(item.productId)?.taxType || 'GRAVADO';
    return sum + (taxType === 'GRAVADO' ? item.subtotal / 1.18 : item.subtotal);
  }, 0);
  const roundedBase = Math.round(baseAmount * 100) / 100;
  const igv = Math.round((sale.total - roundedBase) * 100) / 100;
  const operationNumber = sale.id.slice(-8).toUpperCase();

  const itemRows = sale.items.map((item, index) => [
    { text: String(index + 1), alignment: 'center' },
    {
      stack: [
        { text: item.productName || productById.get(item.productId)?.name || item.productId, bold: true },
        ...(hasMultipleIssuers
          ? [{ text: companyById.get(item.companyId)?.name || item.companyId, color: '#64748b', fontSize: 7 }]
          : []),
      ],
    },
    { text: String(item.quantity), alignment: 'right' },
    { text: money(item.unitPrice), alignment: 'right' },
    { text: money(item.subtotal), alignment: 'right', bold: true },
  ]);

  const paymentRows = sale.isCredit
    ? [[{ text: 'Venta a crédito', colSpan: 2, color: '#c2410c' }, {}]]
    : (sale.payments || []).map((payment) => [
        { text: payment.paymentMethodName || 'Método de pago' },
        { text: money(payment.amount), alignment: 'right' },
      ]);

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 42],
    defaultStyle: { fontSize: 9, color: '#334155' },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: issuer?.name || (hasMultipleIssuers ? 'VENTA MULTIEMPRESA' : 'AGROSYSTEM'), fontSize: 17, bold: true, color: BRAND_GREEN_DARK },
              { text: issuer?.ruc ? `RUC ${issuer.ruc}` : 'Documento interno del sistema', margin: [0, 3, 0, 0] },
              ...(issuer?.address ? [{ text: issuer.address, color: '#64748b', margin: [0, 2, 0, 0] }] : []),
              ...(issuer?.phone ? [{ text: `Tel. ${issuer.phone}`, color: '#64748b', margin: [0, 2, 0, 0] }] : []),
            ],
          },
          {
            width: 190,
            table: {
              widths: ['*'],
              body: [[{
                stack: [
                  { text: getDocumentLabel(sale.voucherType), alignment: 'center', bold: true, fontSize: 12, color: 'white' },
                  { text: `OPERACIÓN ${operationNumber}`, alignment: 'center', bold: true, fontSize: 10, color: 'white', margin: [0, 4, 0, 0] },
                  { text: 'Vista interna - no sustituye el comprobante electrónico', alignment: 'center', fontSize: 7, color: '#dcfce7', margin: [0, 4, 0, 0] },
                ],
                fillColor: BRAND_GREEN,
                margin: [8, 8, 8, 8],
              }]],
            },
            layout: 'noBorders',
          },
        ],
        columnGap: 18,
      },
      ...(sale.isCancelled
        ? [{ text: 'VENTA ANULADA', alignment: 'center', bold: true, color: '#b91c1c', fillColor: '#fee2e2', margin: [0, 14, 0, 0] }]
        : []),
      ...(hasMultipleIssuers && sale.voucherType !== 'NONE'
        ? [{ text: 'Esta venta contiene productos de más de una empresa. Debe separarse por emisor antes de emitir un comprobante fiscal.', color: '#b45309', fillColor: '#fffbeb', margin: [0, 12, 0, 0] }]
        : []),
      {
        table: {
          widths: [85, '*', 65, 90],
          body: [
            [
              { text: 'CLIENTE', bold: true, color: BRAND_GREEN_DARK },
              { text: client?.name || 'Cliente general' },
              { text: 'FECHA', bold: true, color: BRAND_GREEN_DARK },
              { text: formatDate(sale.date), alignment: 'right' },
            ],
            [
              { text: 'DOCUMENTO', bold: true, color: BRAND_GREEN_DARK },
              { text: client?.documentNumber || '-' },
              { text: 'CONDICIÓN', bold: true, color: BRAND_GREEN_DARK },
              { text: sale.isCredit ? 'Crédito' : 'Pago inmediato', alignment: 'right' },
            ],
            [
              { text: 'DIRECCIÓN', bold: true, color: BRAND_GREEN_DARK },
              { text: client?.address || '-', colSpan: 3 },
              {},
              {},
            ],
          ],
        },
        layout: {
          fillColor: (row: number) => (row % 2 === 0 ? '#f8fafc' : null),
          hLineColor: () => BORDER_GRAY,
          vLineColor: () => BORDER_GRAY,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
        margin: [0, 18, 0, 0],
      },
      {
        table: {
          headerRows: 1,
          widths: [24, '*', 45, 70, 75],
          body: [
            [
              { text: '#', style: 'tableHeader', alignment: 'center' },
              { text: 'PRODUCTO', style: 'tableHeader' },
              { text: 'CANT.', style: 'tableHeader', alignment: 'right' },
              { text: 'P. UNIT.', style: 'tableHeader', alignment: 'right' },
              { text: 'SUBTOTAL', style: 'tableHeader', alignment: 'right' },
            ],
            ...itemRows,
          ],
        },
        layout: {
          fillColor: (row: number) => (row === 0 ? BRAND_GREEN : row % 2 === 0 ? '#f8fafc' : null),
          hLineColor: () => BORDER_GRAY,
          vLineColor: () => BORDER_GRAY,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
        margin: [0, 16, 0, 0],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'PAGOS', bold: true, color: BRAND_GREEN_DARK, margin: [0, 0, 0, 5] },
              {
                table: { widths: ['*', 80], body: paymentRows.length > 0 ? paymentRows : [[{ text: 'Sin pagos registrados', colSpan: 2, color: '#94a3b8' }, {}]] },
                layout: {
                  hLineColor: () => BORDER_GRAY,
                  vLineColor: () => BORDER_GRAY,
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                },
              },
            ],
          },
          {
            width: 210,
            table: {
              widths: ['*', 78],
              body: [
                [{ text: 'BASE IMPONIBLE', bold: true }, { text: money(roundedBase), alignment: 'right' }],
                [{ text: 'IGV', bold: true }, { text: money(igv), alignment: 'right' }],
                [{ text: 'TOTAL', bold: true, color: 'white', fillColor: BRAND_GREEN, fontSize: 11 }, { text: money(sale.total), bold: true, color: 'white', fillColor: BRAND_GREEN, alignment: 'right', fontSize: 11 }],
              ],
            },
            layout: {
              fillColor: (row: number) => (row < 2 ? LIGHT_GREEN : null),
              hLineColor: () => BORDER_GRAY,
              vLineColor: () => BORDER_GRAY,
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
        ],
        columnGap: 20,
        margin: [0, 16, 0, 0],
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Generado por Agrosystem', color: '#94a3b8', fontSize: 7 },
        { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', color: '#94a3b8', fontSize: 7 },
      ],
      margin: [36, 0, 36, 0],
    }),
    styles: {
      tableHeader: { bold: true, color: 'white', fontSize: 8 },
    },
  };
}

const getFileName = (sale: Sale) => {
  const type = sale.voucherType === 'NONE' ? 'nota-venta' : sale.voucherType.toLowerCase();
  return `${type}-${sale.id.slice(-8)}.pdf`;
};

export function openSalePdf(params: SalePdfParams) {
  pdfMake.createPdf(buildDocDefinition(params) as any).open();
}

export function downloadSalePdf(params: SalePdfParams) {
  pdfMake.createPdf(buildDocDefinition(params) as any).download(getFileName(params.sale));
}
