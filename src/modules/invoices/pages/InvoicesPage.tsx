import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, FileText, Wallet, Search, X, List, Layers, ChevronDown, ChevronRight, FileDown, Eye, ClipboardList } from 'lucide-react';
import * as XLSX from 'xlsx';
import { usePurchases } from '../../purchases/hooks/usePurchases';
import { useCashRegisters } from '../../cash-register/hooks/useCashRegister';
import { usePaymentAgreements } from '../../accounts-payable/hooks/usePaymentAgreements';
import type { Purchase, CashRegister, CashRegisterEntry, PaymentAgreement } from '../../../shared/types';

type ActiveTab = 'purchases' | 'cash' | 'agreements';
type ViewMode = 'list' | 'grouped';
type SortBy = 'date' | 'issueDate';
type CashEntryWithDate = CashRegisterEntry & { registerDate: string };

interface PurchaseGroup {
  supplier: string;
  items: Purchase[];
  totalPen: number;
  countBoleta: number;
  countFactura: number;
  countContado: number;
  countCredito: number;
}

interface CashGroup {
  empresa: string;
  items: CashEntryWithDate[];
  total: number;
  countBoleta: number;
  countFactura: number;
}

interface AgreementGroup {
  supplier: string;
  items: PaymentAgreement[];
  total: number;
}

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const voucherBadge = (type: string) =>
  type === 'BOLETA' ? 'bg-primary-100 text-primary-800' : 'bg-blue-100 text-blue-800';

const agStatusBadge: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIAL: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};
const agStatusLabel: Record<string, string> = {
  PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagado', CANCELLED: 'Anulado',
};

const cleanDesc = (desc: string) => desc.replace(/\s*\[.*?\]\s*$/, '');

export function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('purchases');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(todayKey);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: purchasesData, isLoading: purchasesLoading } = usePurchases({
    startDate, endDate, limit: 500, page: 1,
  });

  const { data: registersData, isLoading: registersLoading } = useCashRegisters({
    startDate, endDate, limit: 500, page: 1,
  });

  const { data: agreementsRaw = [], isLoading: agreementsLoading } = usePaymentAgreements();

  const purchases: Purchase[] = useMemo(() => {
    const all: Purchase[] = (purchasesData as any)?.data ?? [];
    return all.filter((p) => p.documentType === 'FACTURA' || p.documentType === 'BOLETA');
  }, [purchasesData]);

  const cashEntries: CashEntryWithDate[] = useMemo(() => {
    const raw = registersData as any;
    const registers: CashRegister[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return registers.flatMap((r) =>
      (r.entries || [])
        .filter((e) => !e.isDeleted && e.type === 'EXPENSE' && (e.voucherType === 'BOLETA' || e.voucherType === 'FACTURA'))
        .map((e) => ({ ...e, registerDate: r.date })),
    );
  }, [registersData]);

  const agreements: PaymentAgreement[] = useMemo(() => {
    const all = agreementsRaw as PaymentAgreement[];
    return all.filter(ag => {
      const d = ag.createdAt?.slice(0, 10) || '';
      return d >= startDate && d <= endDate;
    });
  }, [agreementsRaw, startDate, endDate]);

  const filteredPurchases = useMemo(() => {
    let result = purchases;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.supplier?.toLowerCase().includes(q) ||
          p.documentSeries?.toLowerCase().includes(q) ||
          p.documentNumber?.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      const da = sortBy === 'issueDate'
        ? new Date(a.issueDate || a.date).getTime()
        : new Date(a.date).getTime();
      const db = sortBy === 'issueDate'
        ? new Date(b.issueDate || b.date).getTime()
        : new Date(b.date).getTime();
      return db - da;
    });
  }, [purchases, search, sortBy]);

  const filteredCashEntries = useMemo(() => {
    if (!search) return cashEntries;
    const q = search.toLowerCase();
    return cashEntries.filter(
      (e) =>
        cleanDesc(e.description).toLowerCase().includes(q) ||
        e.voucherSeries?.toLowerCase().includes(q) ||
        e.voucherNumber?.toLowerCase().includes(q),
    );
  }, [cashEntries, search]);

  const filteredAgreements = useMemo(() => {
    if (!search) return agreements;
    const q = search.toLowerCase();
    return agreements.filter(ag =>
      ag.supplier?.toLowerCase().includes(q) ||
      ag.documentSeries?.toLowerCase().includes(q) ||
      ag.documentNumber?.toLowerCase().includes(q),
    );
  }, [agreements, search]);

  const purchaseGroups: PurchaseGroup[] = useMemo(() => {
    const map = new Map<string, PurchaseGroup>();
    for (const p of filteredPurchases) {
      const key = p.supplier || '(Sin proveedor)';
      if (!map.has(key)) {
        map.set(key, { supplier: key, items: [], totalPen: 0, countBoleta: 0, countFactura: 0, countContado: 0, countCredito: 0 });
      }
      const g = map.get(key)!;
      g.items.push(p);
      g.totalPen += p.totalCost || 0;
      if (p.documentType === 'BOLETA') g.countBoleta++;
      if (p.documentType === 'FACTURA') g.countFactura++;
      if (p.paymentType === 'CONTADO') g.countContado++;
      if (p.paymentType === 'CREDITO') g.countCredito++;
    }
    return Array.from(map.values()).sort((a, b) => b.totalPen - a.totalPen);
  }, [filteredPurchases]);

  const cashGroups: CashGroup[] = useMemo(() => {
    const map = new Map<string, CashGroup>();
    for (const e of filteredCashEntries) {
      const key = cleanDesc(e.description) || '(Sin descripción)';
      if (!map.has(key)) {
        map.set(key, { empresa: key, items: [], total: 0, countBoleta: 0, countFactura: 0 });
      }
      const g = map.get(key)!;
      g.items.push(e);
      g.total += e.amount;
      if (e.voucherType === 'BOLETA') g.countBoleta++;
      if (e.voucherType === 'FACTURA') g.countFactura++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredCashEntries]);

  const agreementGroups: AgreementGroup[] = useMemo(() => {
    const map = new Map<string, AgreementGroup>();
    for (const ag of filteredAgreements) {
      const key = ag.supplier || '(Sin proveedor)';
      if (!map.has(key)) map.set(key, { supplier: key, items: [], total: 0 });
      const g = map.get(key)!;
      g.items.push(ag);
      g.total += ag.totalAmount || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredAgreements]);

  // IDs de compras que están en un acuerdo activo (PENDING/PARTIAL) → se muestran en gris
  const consolidatedPurchaseIds = useMemo(() => {
    const ids = new Set<string>();
    (agreementsRaw as PaymentAgreement[])
      .filter(ag => ag.status === 'PENDING' || ag.status === 'PARTIAL')
      .forEach(ag => ag.invoices.forEach(inv => { if (inv.purchaseId) ids.add(inv.purchaseId); }));
    return ids;
  }, [agreementsRaw]);

  const totalPurchases = useMemo(() => filteredPurchases.reduce((s, p) => s + (p.totalCost || 0), 0), [filteredPurchases]);
  const totalCash = useMemo(() => filteredCashEntries.reduce((s, e) => s + e.amount, 0), [filteredCashEntries]);
  const totalAgreements = useMemo(() => filteredAgreements.reduce((s, ag) => s + ag.totalAmount, 0), [filteredAgreements]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const isLoading = activeTab === 'purchases' ? purchasesLoading : activeTab === 'cash' ? registersLoading : agreementsLoading;

  const downloadExcel = () => {
    const COLS = ['Fecha', 'Tipo Doc.', 'Serie', 'Número', 'Proveedor / Descripción', 'RUC', 'Moneda', 'Monto', 'Tipo de Pago'];

    const purchaseRows = filteredPurchases.map((p) => ({
      'Fecha': (p.issueDate || p.date)?.slice(0, 10) || '',
      'Tipo Doc.': p.documentType || '',
      'Serie': p.documentSeries || '',
      'Número': p.documentNumber || '',
      'Proveedor / Descripción': p.supplier || '',
      'RUC': p.supplierRuc || '',
      'Moneda': p.totalCostUsd != null ? 'USD' : 'PEN',
      'Monto': p.totalCostUsd != null ? p.totalCostUsd : p.totalCost,
      'Tipo de Pago': p.paymentType || '',
    }));

    const raw = registersData as any;
    const allRegisters: CashRegister[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
    const allCashExpenses = allRegisters.flatMap((r) =>
      (r.entries || [])
        .filter((e) => !e.isDeleted && e.type === 'EXPENSE')
        .map((e) => ({ ...e, registerDate: r.date })),
    );
    const cashRows = allCashExpenses.map((e) => ({
      'Fecha': e.registerDate || '',
      'Tipo Doc.': e.voucherType && e.voucherType !== 'NONE' ? e.voucherType : '',
      'Serie': e.voucherSeries || '',
      'Número': e.voucherNumber || '',
      'Proveedor / Descripción': cleanDesc(e.description),
      'RUC': '',
      'Moneda': 'PEN',
      'Monto': e.amount,
      'Tipo de Pago': 'CONTADO',
    }));

    const agreementRows = filteredAgreements.map((ag) => ({
      'Fecha': ag.createdAt?.slice(0, 10) || '',
      'Tipo Doc.': ag.documentType || '',
      'Serie': ag.documentSeries || '',
      'Número': ag.documentNumber || '',
      'Proveedor / Descripción': ag.supplier || '',
      'RUC': '',
      'Moneda': ag.currency || 'PEN',
      'Monto': ag.totalAmount,
      'Estado': agStatusLabel[ag.status] || ag.status,
      'GR Serie': ag.remisionGuia?.serie || '',
      'GR Correlativo': ag.remisionGuia?.correlativo || '',
      'GR Fecha': ag.remisionGuia?.fecha || '',
    }));

    const colWidths = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 36 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];

    const wsPurchases = XLSX.utils.json_to_sheet(purchaseRows.length ? purchaseRows : [Object.fromEntries(COLS.map(c => [c, '']))]);
    wsPurchases['!cols'] = colWidths;

    const wsCash = XLSX.utils.json_to_sheet(cashRows.length ? cashRows : [Object.fromEntries(COLS.map(c => [c, '']))]);
    wsCash['!cols'] = colWidths;

    const wsAgreements = XLSX.utils.json_to_sheet(agreementRows.length ? agreementRows : [{ Fecha: '', 'Tipo Doc.': '', Serie: '', Número: '', 'Proveedor / Descripción': '', RUC: '', Moneda: '', Monto: '', Estado: '' }]);
    wsAgreements['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 36 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPurchases, 'Compras');
    XLSX.utils.book_append_sheet(wb, wsCash, 'Egresos Caja');
    XLSX.utils.book_append_sheet(wb, wsAgreements, 'Acuerdos de Pago');

    XLSX.writeFile(wb, `facturas_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Receipt size={24} /> Facturas y Boletas
        </h1>
        <button
          onClick={downloadExcel}
          disabled={purchasesLoading || registersLoading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold shadow-sm"
        >
          <FileDown size={16} />
          {purchasesLoading || registersLoading ? 'Cargando datos...' : 'Descargar Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end mb-3 sm:mb-0">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Proveedor, serie, número..."
                className="w-full pl-8 pr-8 py-2 border rounded-lg text-sm sm:w-56"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {/* Sort toggle — only relevant for purchases tab */}
          {activeTab === 'purchases' && (
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Ordenar por</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setSortBy('date')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${sortBy === 'date' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  F. ingreso
                </button>
                <button
                  onClick={() => setSortBy('issueDate')}
                  className={`flex-1 px-3 py-2 text-xs font-medium border-l border-gray-200 transition-colors ${sortBy === 'issueDate' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  F. emisión
                </button>
              </div>
            </div>
          )}
          {/* View mode toggle */}
          <div className="col-span-2 sm:col-span-1 flex sm:ml-auto">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden w-full sm:w-auto">
              <button
                onClick={() => setViewMode('list')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <List size={15} /> Lista
              </button>
              <button
                onClick={() => { setViewMode('grouped'); setExpandedGroups(new Set()); }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${viewMode === 'grouped' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <Layers size={15} /> Agrupado
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Compras con comprobante</div>
          <div className="text-xl font-bold text-gray-800">{filteredPurchases.length}</div>
          <div className="text-sm text-gray-500 mt-1">S/ {totalPurchases.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Egresos de caja con comprobante</div>
          <div className="text-xl font-bold text-gray-800">{filteredCashEntries.length}</div>
          <div className="text-sm text-red-600 mt-1">- S/ {totalCash.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-xs text-gray-500 mb-1">Acuerdos de pago</div>
          <div className="text-xl font-bold text-gray-800">{filteredAgreements.length}</div>
          <div className="text-sm text-gray-500 mt-1">S/ {totalAgreements.toFixed(2)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'purchases' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText size={15} />
          Compras ({viewMode === 'grouped' ? `${purchaseGroups.length} empresas` : filteredPurchases.length})
        </button>
        <button
          onClick={() => setActiveTab('cash')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'cash' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Wallet size={15} />
          Caja Diaria ({viewMode === 'grouped' ? `${cashGroups.length} empresas` : filteredCashEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('agreements')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'agreements' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList size={15} />
          Acuerdos ({viewMode === 'grouped' ? `${agreementGroups.length} proveedores` : filteredAgreements.length})
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      )}

      {/* ── PURCHASES TAB ── */}
      {!isLoading && activeTab === 'purchases' && (
        <>
          {filteredPurchases.length === 0 ? (
            <div className="bg-white rounded-lg border px-4 py-12 text-center text-gray-400 text-sm">
              No hay compras con boleta o factura en este período
            </div>
          ) : viewMode === 'list' ? (
            <>
              {/* Mobile cards */}
              <div className="lg:hidden space-y-2">
                {filteredPurchases.map((p) => {
                  const isConsolidated = consolidatedPurchaseIds.has(p.id);
                  return (
                    <div key={p.id} className={`bg-white rounded-lg border p-3 ${isConsolidated ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-500">{(p.issueDate || p.date)?.slice(0, 10)}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isConsolidated && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600">En acuerdo</span>}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(p.documentType!)}`}>{p.documentType}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.paymentType === 'CONTADO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.paymentType}</span>
                        </div>
                      </div>
                      <div className="font-medium text-gray-800 text-sm mb-1">{p.supplier}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-gray-500">
                          {p.documentSeries && p.documentNumber ? `${p.documentSeries}-${p.documentNumber}` : '—'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800">
                            {p.totalCostUsd != null ? `$ ${p.totalCostUsd.toFixed(2)}` : `S/ ${p.totalCost.toFixed(2)}`}
                          </span>
                          {!isConsolidated && (
                            <Link to={`/purchases/${p.id}`} state={{ from: '/invoices' }} className="p-1.5 rounded-lg bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-600 transition-colors" title="Ver detalle">
                              <Eye size={14} />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="bg-gray-50 rounded-lg border px-4 py-3 flex justify-between text-sm">
                  <span className="font-semibold text-gray-600">{filteredPurchases.length} comprobantes</span>
                  <span className="font-bold text-gray-800">S/ {totalPurchases.toFixed(2)}</span>
                </div>
              </div>
              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serie - N°</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pago</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredPurchases.map((p) => {
                      const isConsolidated = consolidatedPurchaseIds.has(p.id);
                      return (
                        <tr key={p.id} className={`hover:bg-gray-50 ${isConsolidated ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{(p.issueDate || p.date)?.slice(0, 10)}</td>
                          <td className="px-4 py-3 text-sm font-medium">{p.supplier}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(p.documentType!)}`}>{p.documentType}</span>
                              {isConsolidated && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600">En acuerdo</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{p.documentSeries && p.documentNumber ? `${p.documentSeries}-${p.documentNumber}` : <span className="text-gray-400">-</span>}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium whitespace-nowrap">{p.totalCostUsd != null ? `$ ${p.totalCostUsd.toFixed(2)}` : `S/ ${p.totalCost.toFixed(2)}`}</td>
                          <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.paymentType === 'CONTADO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.paymentType}</span></td>
                          <td className="px-4 py-3 text-center">
                            {!isConsolidated && (
                              <Link to={`/purchases/${p.id}`} state={{ from: '/invoices' }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-primary-600 hover:bg-primary-50 font-medium transition-colors" title="Ver detalle">
                                <Eye size={13} /> Ver
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600">Total ({filteredPurchases.length} comprobantes)</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-800">S/ {totalPurchases.toFixed(2)}</td>
                      <td /><td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {purchaseGroups.map((g) => {
                const isOpen = expandedGroups.has(g.supplier);
                return (
                  <div key={g.supplier} className="bg-white rounded-lg border overflow-hidden">
                    <button onClick={() => toggleGroup(g.supplier)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                      <span className="text-gray-400">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span className="flex-1 font-semibold text-gray-800 text-sm">{g.supplier}</span>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {g.countFactura > 0 && <span className="px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">{g.countFactura} fact.</span>}
                        {g.countBoleta > 0 && <span className="px-2 py-0.5 rounded-full font-medium bg-primary-100 text-primary-800">{g.countBoleta} bol.</span>}
                        {g.countCredito > 0 && <span className="px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-800 hidden sm:inline">{g.countCredito} crédito</span>}
                        <span className="font-bold text-gray-800 text-sm whitespace-nowrap">S/ {g.totalPen.toFixed(2)}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t">
                        <div className="lg:hidden divide-y divide-gray-100">
                          {g.items.map((p) => {
                            const isConsolidated = consolidatedPurchaseIds.has(p.id);
                            return (
                              <div key={p.id} className={`px-4 py-3 ${isConsolidated ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-xs text-gray-500">{(p.issueDate || p.date)?.slice(0, 10)}</span>
                                  <div className="flex gap-1.5 items-center">
                                    {isConsolidated && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600">En acuerdo</span>}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(p.documentType!)}`}>{p.documentType}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.paymentType === 'CONTADO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.paymentType}</span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-mono text-gray-500">{p.documentSeries && p.documentNumber ? `${p.documentSeries}-${p.documentNumber}` : '—'}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-800">{p.totalCostUsd != null ? `$ ${p.totalCostUsd.toFixed(2)}` : `S/ ${p.totalCost.toFixed(2)}`}</span>
                                    {!isConsolidated && (
                                      <Link to={`/purchases/${p.id}`} state={{ from: '/invoices' }} className="p-1.5 rounded-lg bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-600 transition-colors">
                                        <Eye size={14} />
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <table className="hidden lg:table w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Fecha</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Tipo</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Serie - N°</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Total</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-400 uppercase">Pago</th>
                              <th className="px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.items.map((p) => {
                              const isConsolidated = consolidatedPurchaseIds.has(p.id);
                              return (
                                <tr key={p.id} className={`hover:bg-gray-50 ${isConsolidated ? 'opacity-50' : ''}`}>
                                  <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{(p.issueDate || p.date)?.slice(0, 10)}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(p.documentType!)}`}>{p.documentType}</span>
                                      {isConsolidated && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600">En acuerdo</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm font-mono">{p.documentSeries && p.documentNumber ? `${p.documentSeries}-${p.documentNumber}` : <span className="text-gray-400">-</span>}</td>
                                  <td className="px-4 py-2.5 text-sm text-right font-medium whitespace-nowrap">{p.totalCostUsd != null ? `$ ${p.totalCostUsd.toFixed(2)}` : `S/ ${p.totalCost.toFixed(2)}`}</td>
                                  <td className="px-4 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.paymentType === 'CONTADO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.paymentType}</span></td>
                                  <td className="px-4 py-2.5 text-center">
                                    {!isConsolidated && (
                                      <Link to={`/purchases/${p.id}`} state={{ from: '/invoices' }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-primary-600 hover:bg-primary-50 font-medium transition-colors">
                                        <Eye size={13} /> Ver
                                      </Link>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="bg-gray-50 rounded-lg border px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">Total — {purchaseGroups.length} empresa{purchaseGroups.length !== 1 ? 's' : ''}, {filteredPurchases.length} comprobante{filteredPurchases.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold text-gray-800">S/ {totalPurchases.toFixed(2)}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CASH TAB ── */}
      {!isLoading && activeTab === 'cash' && (
        <>
          {filteredCashEntries.length === 0 ? (
            <div className="bg-white rounded-lg border px-4 py-12 text-center text-gray-400 text-sm">
              No hay egresos con boleta o factura en este período
            </div>
          ) : viewMode === 'list' ? (
            <>
              <div className="lg:hidden space-y-2">
                {filteredCashEntries.map((e, idx) => (
                  <div key={`${e.id}-${idx}`} className="bg-white rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs text-gray-500">{e.registerDate}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${voucherBadge(e.voucherType)}`}>{e.voucherType}</span>
                    </div>
                    <div className="text-sm font-medium text-gray-800 mb-1 truncate">{cleanDesc(e.description)}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-gray-500">{e.voucherSeries && e.voucherNumber ? `${e.voucherSeries}-${e.voucherNumber}` : '—'}</span>
                      <span className="text-sm font-bold text-red-600">- S/ {e.amount.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                <div className="bg-gray-50 rounded-lg border px-4 py-3 flex justify-between text-sm">
                  <span className="font-semibold text-gray-600">{filteredCashEntries.length} comprobantes</span>
                  <span className="font-bold text-red-700">- S/ {totalCash.toFixed(2)}</span>
                </div>
              </div>
              <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serie - N°</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCashEntries.map((e, idx) => (
                      <tr key={`${e.id}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{e.registerDate}</td>
                        <td className="px-4 py-3 text-sm">{cleanDesc(e.description)}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(e.voucherType)}`}>{e.voucherType}</span></td>
                        <td className="px-4 py-3 text-sm font-mono">{e.voucherSeries && e.voucherNumber ? `${e.voucherSeries}-${e.voucherNumber}` : <span className="text-gray-400">-</span>}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-red-600 whitespace-nowrap">- S/ {e.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600">Total ({filteredCashEntries.length} comprobantes)</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-red-700">- S/ {totalCash.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {cashGroups.map((g) => {
                const isOpen = expandedGroups.has(g.empresa);
                return (
                  <div key={g.empresa} className="bg-white rounded-lg border overflow-hidden">
                    <button onClick={() => toggleGroup(g.empresa)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                      <span className="text-gray-400">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span className="flex-1 font-semibold text-gray-800 text-sm">{g.empresa}</span>
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {g.countFactura > 0 && <span className="px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">{g.countFactura} fact.</span>}
                        {g.countBoleta > 0 && <span className="px-2 py-0.5 rounded-full font-medium bg-primary-100 text-primary-800">{g.countBoleta} bol.</span>}
                        <span className="font-bold text-red-700 text-sm whitespace-nowrap">- S/ {g.total.toFixed(2)}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t">
                        <div className="lg:hidden divide-y divide-gray-100">
                          {g.items.map((e, idx) => (
                            <div key={`${e.id}-${idx}`} className="px-4 py-3 flex items-center justify-between gap-2">
                              <div>
                                <span className="text-xs text-gray-500">{e.registerDate}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(e.voucherType)}`}>{e.voucherType}</span>
                                  <span className="text-xs font-mono text-gray-500">{e.voucherSeries && e.voucherNumber ? `${e.voucherSeries}-${e.voucherNumber}` : '—'}</span>
                                </div>
                              </div>
                              <span className="text-sm font-bold text-red-600 flex-shrink-0">- S/ {e.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <table className="hidden lg:table w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Fecha</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Tipo</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Serie - N°</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.items.map((e, idx) => (
                              <tr key={`${e.id}-${idx}`} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{e.registerDate}</td>
                                <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(e.voucherType)}`}>{e.voucherType}</span></td>
                                <td className="px-4 py-2.5 text-sm font-mono">{e.voucherSeries && e.voucherNumber ? `${e.voucherSeries}-${e.voucherNumber}` : <span className="text-gray-400">-</span>}</td>
                                <td className="px-4 py-2.5 text-sm text-right font-medium text-red-600 whitespace-nowrap">- S/ {e.amount.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="bg-gray-50 rounded-lg border px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">Total — {cashGroups.length} empresa{cashGroups.length !== 1 ? 's' : ''}, {filteredCashEntries.length} comprobante{filteredCashEntries.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold text-red-700">- S/ {totalCash.toFixed(2)}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── AGREEMENTS TAB ── */}
      {!isLoading && activeTab === 'agreements' && (
        <>
          {filteredAgreements.length === 0 ? (
            <div className="bg-white rounded-lg border px-4 py-12 text-center text-gray-400 text-sm">
              No hay acuerdos de pago en este período
            </div>
          ) : viewMode === 'list' ? (
            <>
              {/* Mobile cards */}
              <div className="lg:hidden space-y-2">
                {filteredAgreements.map((ag) => {
                  const sym = ag.currency === 'USD' ? '$' : 'S/';
                  return (
                    <div key={ag.id} className="bg-white rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-500">{ag.createdAt?.slice(0, 10)}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {ag.documentType && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(ag.documentType)}`}>{ag.documentType}</span>}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agStatusBadge[ag.status] || ''}`}>{agStatusLabel[ag.status] || ag.status}</span>
                          <Link to={`/agreements/${ag.id}`} state={{ from: '/invoices' }} className="p-1.5 rounded-lg bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-600 transition-colors"><Eye size={14} /></Link>
                        </div>
                      </div>
                      <div className="font-medium text-gray-800 text-sm mb-1">{ag.supplier}</div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          {ag.documentSeries && ag.documentNumber && <span className="text-xs font-mono text-gray-500">{ag.documentSeries}-{ag.documentNumber}</span>}
                          {ag.remisionGuia && <span className="text-[10px] text-gray-400">GR: {ag.remisionGuia.serie}-{ag.remisionGuia.correlativo}</span>}
                        </div>
                        <span className="text-sm font-bold text-gray-800">{sym} {ag.totalAmount.toFixed(2)}</span>
                      </div>
                      {ag.invoices?.some(inv => inv.purchaseId) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {ag.invoices.map((inv, i) =>
                            inv.purchaseId
                              ? <Link key={i} to={`/purchases/${inv.purchaseId}`} state={{ from: '/invoices' }}
                                  className="text-[11px] font-mono text-primary-600 bg-primary-50 hover:bg-primary-100 px-1.5 py-0.5 rounded transition-colors hover:underline underline-offset-2">
                                  {inv.purchaseRef || inv.apId.slice(-6)}
                                </Link>
                              : <span key={i} className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{inv.purchaseRef || inv.apId.slice(-6)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="bg-gray-50 rounded-lg border px-4 py-3 flex justify-between text-sm">
                  <span className="font-semibold text-gray-600">{filteredAgreements.length} acuerdos</span>
                  <span className="font-bold text-gray-800">S/ {totalAgreements.toFixed(2)}</span>
                </div>
              </div>
              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serie - N°</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guía Rem.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Facturas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAgreements.map((ag) => {
                      const sym = ag.currency === 'USD' ? '$' : 'S/';
                      return (
                        <tr key={ag.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{ag.createdAt?.slice(0, 10)}</td>
                          <td className="px-4 py-3 text-sm font-medium">{ag.supplier}</td>
                          <td className="px-4 py-3">{ag.documentType ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(ag.documentType)}`}>{ag.documentType}</span> : <span className="text-gray-400 text-xs">-</span>}</td>
                          <td className="px-4 py-3 text-sm font-mono">{ag.documentSeries && ag.documentNumber ? `${ag.documentSeries}-${ag.documentNumber}` : <span className="text-gray-400">-</span>}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{ag.remisionGuia ? `${ag.remisionGuia.serie}-${ag.remisionGuia.correlativo} (${ag.remisionGuia.fecha})` : <span className="text-gray-400">-</span>}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(ag.invoices || []).map((inv, i) =>
                                inv.purchaseId
                                  ? <Link key={i} to={`/purchases/${inv.purchaseId}`} state={{ from: '/invoices' }}
                                      className="text-[11px] font-mono text-primary-600 bg-primary-50 hover:bg-primary-100 px-1.5 py-0.5 rounded transition-colors hover:underline underline-offset-2">
                                      {inv.purchaseRef || inv.apId.slice(-6)}
                                    </Link>
                                  : <span key={i} className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{inv.purchaseRef || inv.apId.slice(-6)}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium whitespace-nowrap">{sym} {ag.totalAmount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agStatusBadge[ag.status] || ''}`}>{agStatusLabel[ag.status] || ag.status}</span></td>
                          <td className="px-4 py-3 text-center">
                            <Link to={`/agreements/${ag.id}`} state={{ from: '/invoices' }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-primary-600 hover:bg-primary-50 font-medium transition-colors">
                              <Eye size={13} /> Ver
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-600">Total ({filteredAgreements.length} acuerdos)</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-800">S/ {totalAgreements.toFixed(2)}</td>
                      <td /><td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            /* GROUPED VIEW */
            <div className="space-y-2">
              {agreementGroups.map((g) => {
                const isOpen = expandedGroups.has(g.supplier);
                return (
                  <div key={g.supplier} className="bg-white rounded-lg border overflow-hidden">
                    <button onClick={() => toggleGroup(g.supplier)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                      <span className="text-gray-400">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span className="flex-1 font-semibold text-gray-800 text-sm">{g.supplier}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{g.items.length} acuerdo{g.items.length !== 1 ? 's' : ''}</span>
                        <span className="font-bold text-gray-800 text-sm whitespace-nowrap">S/ {g.total.toFixed(2)}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t">
                        <div className="lg:hidden divide-y divide-gray-100">
                          {g.items.map((ag) => {
                            const sym = ag.currency === 'USD' ? '$' : 'S/';
                            return (
                              <div key={ag.id} className="px-4 py-3">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-xs text-gray-500">{ag.createdAt?.slice(0, 10)}</span>
                                  <div className="flex gap-1 items-center">
                                    {ag.documentType && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(ag.documentType)}`}>{ag.documentType}</span>}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agStatusBadge[ag.status] || ''}`}>{agStatusLabel[ag.status] || ag.status}</span>
                                    <Link to={`/agreements/${ag.id}`} state={{ from: '/invoices' }} className="p-1.5 rounded-lg bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-600 transition-colors"><Eye size={14} /></Link>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono text-gray-500">{ag.documentSeries && ag.documentNumber ? `${ag.documentSeries}-${ag.documentNumber}` : '—'}</span>
                                  <span className="text-sm font-bold text-gray-800">{sym} {ag.totalAmount.toFixed(2)}</span>
                                </div>
                                {ag.invoices?.some(inv => inv.purchaseId) && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {ag.invoices.map((inv, i) =>
                                      inv.purchaseId
                                        ? <Link key={i} to={`/purchases/${inv.purchaseId}`} state={{ from: '/invoices' }}
                                            className="text-[11px] font-mono text-primary-600 bg-primary-50 hover:bg-primary-100 px-1.5 py-0.5 rounded transition-colors hover:underline underline-offset-2">
                                            {inv.purchaseRef || inv.apId.slice(-6)}
                                          </Link>
                                        : <span key={i} className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{inv.purchaseRef || inv.apId.slice(-6)}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <table className="hidden lg:table w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Fecha</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Tipo</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Serie - N°</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Guía Rem.</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Facturas</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Total</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-400 uppercase">Estado</th>
                              <th className="px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.items.map((ag) => {
                              const sym = ag.currency === 'USD' ? '$' : 'S/';
                              return (
                                <tr key={ag.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{ag.createdAt?.slice(0, 10)}</td>
                                  <td className="px-4 py-2.5">{ag.documentType ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${voucherBadge(ag.documentType)}`}>{ag.documentType}</span> : <span className="text-gray-400 text-xs">-</span>}</td>
                                  <td className="px-4 py-2.5 text-sm font-mono">{ag.documentSeries && ag.documentNumber ? `${ag.documentSeries}-${ag.documentNumber}` : <span className="text-gray-400">-</span>}</td>
                                  <td className="px-4 py-2.5 text-xs text-gray-500">{ag.remisionGuia ? `${ag.remisionGuia.serie}-${ag.remisionGuia.correlativo}` : <span className="text-gray-400">-</span>}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex flex-wrap gap-1">
                                      {(ag.invoices || []).map((inv, i) =>
                                        inv.purchaseId
                                          ? <Link key={i} to={`/purchases/${inv.purchaseId}`} state={{ from: '/invoices' }}
                                              className="text-[11px] font-mono text-primary-600 bg-primary-50 hover:bg-primary-100 px-1.5 py-0.5 rounded transition-colors hover:underline underline-offset-2">
                                              {inv.purchaseRef || inv.apId.slice(-6)}
                                            </Link>
                                          : <span key={i} className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{inv.purchaseRef || inv.apId.slice(-6)}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-right font-medium whitespace-nowrap">{sym} {ag.totalAmount.toFixed(2)}</td>
                                  <td className="px-4 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agStatusBadge[ag.status] || ''}`}>{agStatusLabel[ag.status] || ag.status}</span></td>
                                  <td className="px-4 py-2.5 text-center">
                                    <Link to={`/agreements/${ag.id}`} state={{ from: '/invoices' }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-primary-600 hover:bg-primary-50 font-medium transition-colors">
                                      <Eye size={13} /> Ver
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="bg-gray-50 rounded-lg border px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">Total — {agreementGroups.length} proveedor{agreementGroups.length !== 1 ? 'es' : ''}, {filteredAgreements.length} acuerdo{filteredAgreements.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold text-gray-800">S/ {totalAgreements.toFixed(2)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
