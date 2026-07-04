import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuotes, useUpdateQuoteStatus } from '../hooks/useQuotes';
import { useProducts } from '../../products/hooks/useProducts';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useClients } from '../../clients/hooks/useClients';
import { useAuth } from '../../../app/providers/AuthProvider';
import { DataTable } from '../../../shared/components/DataTable';
import { Pagination } from '../../../shared/components/Pagination';
import {
  ScrollText, Download, Printer, CheckCircle2, XCircle,
  ShoppingCart, Clock, TrendingUp, FileCheck2,
} from 'lucide-react';
import type { Quote, QuoteStatus, Product, Company, Client } from '../../../shared/types';
import { downloadQuotePdf, printQuotePdf } from '../utils/quotePdf';

const STATUS_META: Record<QuoteStatus, { label: string; color: string; border: string; dot: string }> = {
  PENDING:   { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', border: 'border-l-yellow-400',  dot: 'bg-yellow-400' },
  ACCEPTED:  { label: 'Aceptada',  color: 'bg-blue-100 text-blue-700 border-blue-300',       border: 'border-l-blue-400',   dot: 'bg-blue-400' },
  REJECTED:  { label: 'Rechazada', color: 'bg-gray-100 text-gray-600 border-gray-300',       border: 'border-l-gray-300',   dot: 'bg-gray-400' },
  EXPIRED:   { label: 'Vencida',   color: 'bg-red-100 text-red-700 border-red-300',          border: 'border-l-red-400',    dot: 'bg-red-400' },
  CONVERTED: { label: 'Vendida',   color: 'bg-green-100 text-green-700 border-green-300',    border: 'border-l-green-400',  dot: 'bg-green-500' },
};

const ALL_STATUSES: QuoteStatus[] = ['PENDING', 'ACCEPTED', 'CONVERTED', 'EXPIRED', 'REJECTED'];

export function QuotesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');

  // Fetch current page + all (for counts/KPIs)
  const { data, isLoading } = useQuotes({ page, limit: 20, status: statusFilter || undefined });
  const { data: allData } = useQuotes({ limit: 9999 });

  const { data: productsData } = useProducts({ limit: 500 });
  const { data: companiesData } = useCompanies();
  const { data: clientsData } = useClients();
  const { user } = useAuth();
  const updateStatus = useUpdateQuoteStatus();

  const quotes: Quote[] = data?.data || [];
  const total = data?.total || 0;
  const allQuotes: Quote[] = (allData as any)?.data || [];

  const products: Product[] = productsData?.data || [];
  const companies: Company[] = useMemo(() => {
    const raw: any = companiesData;
    return Array.isArray(raw) ? raw : (raw?.data ?? []);
  }, [companiesData]);
  const clients: Client[] = useMemo(() => {
    const raw: any = clientsData;
    return Array.isArray(raw) ? raw : (raw?.data ?? []);
  }, [clientsData]);

  // ── KPI counts ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const pending = allQuotes.filter(q => q.status === 'PENDING');
    return {
      total: allQuotes.length,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, q) => s + q.total, 0),
      convertedCount: allQuotes.filter(q => q.status === 'CONVERTED').length,
    };
  }, [allQuotes]);

  // ── Per-status counts for filter pills ───────────────────────────────────
  const countByStatus = useMemo(() => {
    const map: Partial<Record<QuoteStatus, number>> = {};
    for (const s of ALL_STATUSES) map[s] = allQuotes.filter(q => q.status === s).length;
    return map;
  }, [allQuotes]);

  const getCompany = (id?: string) => companies.find(c => c.id === id);
  const getClient  = (id?: string) => clients.find(c => c.id === id);
  const vendor     = { name: user?.fullName, email: user?.email };
  const pdfParams  = (q: Quote) => ({ quote: q, products, company: getCompany(q.companyId), client: getClient(q.clientId), vendor });

  const validColor = (q: Quote) => {
    const days = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days < 0 ? 'text-red-600' : days <= 3 ? 'text-orange-600' : 'text-gray-500';
  };

  // ── Desktop columns ───────────────────────────────────────────────────────
  const columns = [
    {
      key: 'quoteNumber', header: 'Nº Cotización',
      render: (q: Quote) => <span className="font-mono font-semibold text-gray-800">{q.quoteNumber}</span>,
    },
    {
      key: 'issueDate', header: 'Emisión',
      render: (q: Quote) => new Date(q.issueDate).toLocaleDateString('es-PE'),
    },
    {
      key: 'validUntil', header: 'Válida hasta',
      render: (q: Quote) => {
        const d = new Date(q.validUntil);
        const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return (
          <span className={days < 0 ? 'text-red-600 font-medium' : days <= 3 ? 'text-orange-600 font-medium' : 'text-gray-700'}>
            {d.toLocaleDateString('es-PE')}
            {q.status === 'PENDING' && days >= 0 && <span className="text-xs text-gray-400 ml-1">({days}d)</span>}
          </span>
        );
      },
    },
    { key: 'clientName', header: 'Cliente', render: (q: Quote) => q.clientName || <span className="text-gray-400">—</span> },
    { key: 'items',  header: 'Ítems',  render: (q: Quote) => `${q.items.length}` },
    { key: 'total',  header: 'Total',  render: (q: Quote) => <span className="font-semibold">S/ {q.total.toFixed(2)}</span> },
    {
      key: 'status', header: 'Estado',
      render: (q: Quote) => {
        const meta = STATUS_META[q.status];
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>{meta.label}</span>;
      },
    },
    {
      key: 'actions', header: '',
      render: (q: Quote) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); downloadQuotePdf(pdfParams(q)); }} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded" title="Descargar PDF"><Download size={15} /></button>
          <button onClick={(e) => { e.stopPropagation(); printQuotePdf(pdfParams(q)); }} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded" title="Ver / imprimir PDF"><Printer size={15} /></button>
          {(q.status === 'PENDING' || q.status === 'ACCEPTED') && (
            <button onClick={(e) => { e.stopPropagation(); navigate(`/pos?fromQuote=${q.id}`); }} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Convertir a venta"><ShoppingCart size={15} /></button>
          )}
          {q.status === 'PENDING' && (
            <>
              <button onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: q.id, status: 'ACCEPTED' }); }} disabled={updateStatus.isPending} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40" title="Marcar aceptada"><CheckCircle2 size={15} /></button>
              <button onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: q.id, status: 'REJECTED' }); }} disabled={updateStatus.isPending} className="p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-40" title="Marcar rechazada"><XCircle size={15} /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ScrollText size={24} className="text-primary-600" /> Cotizaciones
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestiona y convierte tus cotizaciones en ventas</p>
        </div>
      </div>

      {/* ── KPI banner ── */}
      {allQuotes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <ScrollText size={18} className="text-primary-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-xl font-bold text-gray-800">{kpis.total}</div>
            </div>
          </div>

          <div className="bg-white border border-yellow-200 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
              <Clock size={18} className="text-yellow-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Pendientes</div>
              <div className="text-xl font-bold text-yellow-700">{kpis.pendingCount}</div>
            </div>
          </div>

          <div className="bg-white border border-blue-200 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-blue-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Monto pendiente</div>
              <div className="text-lg font-bold text-blue-700">S/ {kpis.pendingAmount.toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-white border border-green-200 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <FileCheck2 size={18} className="text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Convertidas</div>
              <div className="text-xl font-bold text-green-700">{kpis.convertedCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status filter pills with counts ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap scrollbar-hide">
        <button
          onClick={() => { setStatusFilter(''); setPage(1); }}
          className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${statusFilter === '' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}
        >
          Todas
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${statusFilter === '' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {allQuotes.length}
          </span>
        </button>
        {ALL_STATUSES.map(s => {
          const meta = STATUS_META[s];
          const count = countByStatus[s] ?? 0;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`whitespace-nowrap flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-white' : meta.dot}`} />
              {meta.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Mobile cards ── */}
      <div className="lg:hidden space-y-3">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
        ) : quotes.length === 0 ? (
          <div className="py-16 text-center">
            <ScrollText size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">Sin cotizaciones</p>
            <p className="text-xs text-gray-300 mt-1">Crea una desde el POS al finalizar una venta</p>
          </div>
        ) : quotes.map(q => {
          const meta   = STATUS_META[q.status];
          const dValid = new Date(q.validUntil);
          const days   = Math.ceil((dValid.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const vc     = validColor(q);
          return (
            <div
              key={q.id}
              className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 ${meta.border}`}
            >
              <div className="p-4">
                {/* Top row: number + badge */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-gray-800">{q.quoteNumber}</span>
                    {q.clientName && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{q.clientName}</div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Dates + total */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <div>Emisión: <span className="text-gray-600">{new Date(q.issueDate).toLocaleDateString('es-PE')}</span></div>
                    <div className={vc}>
                      Válida: {dValid.toLocaleDateString('es-PE')}
                      {q.status === 'PENDING' && days >= 0 && <span className="ml-1 text-gray-400">({days}d)</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-gray-800 text-lg">S/ {q.total.toFixed(2)}</div>
                    <div className="text-[11px] text-gray-400">{q.items.length} ítem{q.items.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => downloadQuotePdf(pdfParams(q))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                  >
                    <Download size={13} /> Descargar
                  </button>
                  <button
                    onClick={() => printQuotePdf(pdfParams(q))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                  >
                    <Printer size={13} /> Imprimir
                  </button>
                  {(q.status === 'PENDING' || q.status === 'ACCEPTED') && (
                    <button
                      onClick={() => navigate(`/pos?fromQuote=${q.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                    >
                      <ShoppingCart size={13} /> Convertir a venta
                    </button>
                  )}
                  {q.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => updateStatus.mutate({ id: q.id, status: 'ACCEPTED' })}
                        disabled={updateStatus.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <CheckCircle2 size={13} /> Aceptar
                      </button>
                      <button
                        onClick={() => updateStatus.mutate({ id: q.id, status: 'REJECTED' })}
                        disabled={updateStatus.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <XCircle size={13} /> Rechazar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden lg:block">
        <DataTable columns={columns} data={quotes} isLoading={isLoading} hoverClass="hover:bg-primary-50" />
        {!isLoading && quotes.length === 0 && (
          <div className="py-16 text-center">
            <ScrollText size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">Sin cotizaciones</p>
            <p className="text-xs text-gray-300 mt-1">Crea una desde el POS al finalizar una venta</p>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={setPage} />
    </div>
  );
}
