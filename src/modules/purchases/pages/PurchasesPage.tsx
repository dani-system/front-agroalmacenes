import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePurchases, useUpdateRemisionGuia } from '../hooks/usePurchases';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useAccountsPayable } from '../../accounts-payable/hooks/useAccountsPayable';
import { useSuppliers } from '../../suppliers/hooks/useSuppliers';
import { Modal } from '../../../shared/components/Modal';
import {
  Plus, ShoppingCart, Eye, ChevronDown, ChevronRight,
  Search, Building2, AlertCircle, CheckCircle, Clock, TrendingDown, DollarSign, FileText, Archive, Trash2,
} from 'lucide-react';
import type { Purchase, Company, AccountPayable, Supplier } from '../../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const receptionCfg: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  PARTIAL:  { label: 'Parcial',   cls: 'bg-blue-100 text-blue-800' },
  RECEIVED: { label: 'Completo',  cls: 'bg-green-100 text-green-800' },
};

const paymentStatusCfg: Record<string, { label: string; cls: string }> = {
  PENDING:      { label: 'Pendiente',   cls: 'bg-yellow-100 text-yellow-800' },
  PARTIAL:      { label: 'Parcial',     cls: 'bg-blue-100 text-blue-800' },
  PAID:         { label: 'Pagado',      cls: 'bg-green-100 text-green-800' },
  CONSOLIDATED: { label: 'Consolidado', cls: 'bg-purple-100 text-purple-800' },
  CONTADO:      { label: 'Contado',     cls: 'bg-green-100 text-green-700' },
};

function getPaymentStatus(purchase: Purchase, ap?: AccountPayable) {
  if (purchase.paymentType === 'CONTADO') return paymentStatusCfg.CONTADO;
  if (!ap) return { label: 'Sin C.P.', cls: 'bg-gray-100 text-gray-500' };
  return paymentStatusCfg[ap.status] || { label: ap.status, cls: 'bg-gray-100 text-gray-500' };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isOverdue(ap?: AccountPayable): boolean {
  if (!ap || ap.status === 'PAID' || ap.status === 'CONSOLIDATED') return false;
  const today = todayStr();
  if (ap.paymentScheduleType === 'INSTALLMENTS') {
    const next = ap.installments.find(i => i.status === 'PENDING');
    return next ? next.dueDate.slice(0, 10) < today : false;
  }
  return ap.dueDate ? ap.dueDate.slice(0, 10) < today : false;
}

function getDocRef(p: Purchase): string {
  if (p.documentSeries && p.documentNumber) return `${p.documentSeries}-${p.documentNumber}`;
  if (p.documentNumber) return p.documentNumber;
  return '—';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PurchasesPage() {
  const navigate = useNavigate();
  const [companyFilter, setCompanyFilter] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [remisionModal, setRemisionModal] = useState<{ purchaseId: string; existing?: Purchase['remisionGuia'] } | null>(null);
  const [remisionForm, setRemisionForm] = useState({ serie: '', correlativo: '', fecha: '' });
  const { data, isLoading } = usePurchases({ limit: 500, companyId: companyFilter || undefined });
  const { data: apData } = useAccountsPayable({ limit: 500 });
  const { data: companies } = useCompanies();
  const { data: suppliersData } = useSuppliers({ limit: 500 });
  const updateRemisionGuia = useUpdateRemisionGuia();

  const supplierList: Supplier[] = Array.isArray(suppliersData?.data) ? suppliersData.data : [];

  const companyList: Company[] = Array.isArray(companies) ? companies : [];
  const allPurchases: Purchase[] = data?.data || [];

  const apByPurchaseId = useMemo(() => {
    const map: Record<string, AccountPayable> = {};
    (apData?.data || []).forEach((ap: AccountPayable) => { map[ap.purchaseId] = ap; });
    return map;
  }, [apData]);

  type SupplierGroup = {
    supplier: string; ruc?: string; purchases: Purchase[];
    totalCost: number; totalCostUsd: number;
    totalDebt: number; totalDebtUsd: number;
    hasOverdue: boolean; hasConsolidated: boolean;
  };

  const groups = useMemo((): SupplierGroup[] => {
    const map: Record<string, SupplierGroup> = {};
    allPurchases.forEach(p => {
      if (!map[p.supplier]) map[p.supplier] = { supplier: p.supplier, ruc: p.supplierRuc, purchases: [], totalCost: 0, totalCostUsd: 0, totalDebt: 0, totalDebtUsd: 0, hasOverdue: false, hasConsolidated: false };
      const g = map[p.supplier];
      g.purchases.push(p);
      g.totalCost += p.totalCost;
      if (p.totalCostUsd) g.totalCostUsd += p.totalCostUsd;
      const ap = apByPurchaseId[p.id];
      if (ap && ap.status !== 'PAID') {
        if (ap.currency === 'USD') {
          g.totalDebtUsd += ap.pendingAmount;
        } else {
          g.totalDebt += ap.pendingAmount;
        }
      }
      if (isOverdue(ap)) g.hasOverdue = true;
      if (ap?.status === 'CONSOLIDATED') g.hasConsolidated = true;
    });
    return Object.values(map)
      .map(g => ({ ...g, purchases: [...g.purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) }))
      .sort((a, b) => { if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1; return a.supplier.localeCompare(b.supplier); });
  }, [allPurchases, apByPurchaseId]);

  // ── Global totals ──
  const globalTotals = useMemo(() => {
    const totalCompras = allPurchases.reduce((s, p) => s + p.totalCost, 0);
    const totalComprasUsd = allPurchases.reduce((s, p) => s + (p.totalCostUsd || 0), 0);
    const totalDeuda = groups.reduce((s, g) => s + g.totalDebt, 0);
    const totalDeudaUsd = groups.reduce((s, g) => s + g.totalDebtUsd, 0);
    const totalVencida = Object.values(apByPurchaseId)
      .filter(ap => isOverdue(ap))
      .reduce((s, ap) => s + ap.pendingAmount, 0);
    return { totalCompras, totalComprasUsd, totalDeuda, totalDeudaUsd, totalVencida };
  }, [allPurchases, groups, apByPurchaseId]);

  const filteredGroups = useMemo(() => {
    const base = supplierSearch.trim()
      ? groups.filter(g => g.supplier.toLowerCase().includes(supplierSearch.toLowerCase()) || g.ruc?.includes(supplierSearch))
      : groups;
    return base.map(g => ({
      ...g,
      purchases: [...g.purchases].sort((a, b) => {
        const da = new Date((a as any).issueDate || a.date).getTime();
        const db = new Date((b as any).issueDate || b.date).getTime();
        return db - da;
      }),
    }));
  }, [groups, supplierSearch]);

  useEffect(() => {
    if (supplierSearch.trim()) setExpanded(new Set(filteredGroups.map(g => g.supplier)));
  }, [supplierSearch, filteredGroups]);

  const toggleSupplier = (supplier: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(supplier) ? s.delete(supplier) : s.add(supplier); return s; });

  const getCompanyName = (id: string) => companyList.find(c => c.id === id)?.name || '—';

  const openRemisionModal = (e: React.MouseEvent, purchase: Purchase) => {
    e.stopPropagation();
    setRemisionForm({
      serie: purchase.remisionGuia?.serie || '',
      correlativo: purchase.remisionGuia?.correlativo || '',
      fecha: purchase.remisionGuia?.fecha ? purchase.remisionGuia.fecha.slice(0, 10) : '',
    });
    setRemisionModal({ purchaseId: purchase.id, existing: purchase.remisionGuia });
  };

  const handleRemisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remisionModal) return;
    await updateRemisionGuia.mutateAsync({ id: remisionModal.purchaseId, data: remisionForm });
    setRemisionModal(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart size={24} /> Compras / Ingresos
        </h1>
        <div className="flex items-center gap-2">
          <Link to="/purchases/new?historical=true"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors">
            <Archive size={16} /> Factura Antigua
          </Link>
          <Link to="/purchases/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors">
            <Plus size={18} /> Nueva Compra
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && allPurchases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <ShoppingCart size={13} /> Total compras
            </div>
            <div className="text-xl font-bold text-gray-800">S/ {globalTotals.totalCompras.toFixed(2)}</div>
            {globalTotals.totalComprasUsd > 0 && (
              <div className="text-sm text-primary-600 font-medium mt-0.5 flex items-center gap-1">
                <DollarSign size={12} /> {globalTotals.totalComprasUsd.toFixed(2)} USD
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">{allPurchases.length} compras · {groups.length} proveedores</div>
          </div>

          <div className="bg-white rounded-xl border border-red-100 shadow-sm px-5 py-4">
            <div className="text-xs text-red-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <TrendingDown size={13} /> Total deuda proveedores
            </div>
            <div className="text-xl font-bold text-red-600">S/ {globalTotals.totalDeuda.toFixed(2)}</div>
            {globalTotals.totalDeudaUsd > 0 && (
              <div className="text-sm text-orange-600 font-medium mt-0.5 flex items-center gap-1">
                <DollarSign size={12} /> {globalTotals.totalDeudaUsd.toFixed(2)} USD
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              {groups.filter(g => g.totalDebt > 0 || g.totalDebtUsd > 0).length} proveedores con deuda
            </div>
          </div>

          <div className={`bg-white rounded-xl border shadow-sm px-5 py-4 ${globalTotals.totalVencida > 0 ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
            <div className={`text-xs uppercase tracking-wide mb-1 flex items-center gap-1.5 ${globalTotals.totalVencida > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              <AlertCircle size={13} /> Deuda vencida
            </div>
            <div className={`text-xl font-bold ${globalTotals.totalVencida > 0 ? 'text-red-700' : 'text-gray-400'}`}>
              S/ {globalTotals.totalVencida.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {globalTotals.totalVencida > 0 ? 'Requiere atención inmediata' : 'Sin pagos vencidos'}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}
              placeholder="Buscar proveedor o RUC..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary-400 transition-colors" />
          </div>
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary-400 flex-shrink-0">
            <option value="">Todas</option>
            {companyList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {filteredGroups.length > 0 && (
          <div className="flex gap-2">
            <button onClick={() => setExpanded(new Set(filteredGroups.map(g => g.supplier)))}
              className="flex-1 sm:flex-none px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Expandir todo
            </button>
            <button onClick={() => setExpanded(new Set())}
              className="flex-1 sm:flex-none px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Colapsar todo
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      {!isLoading && filteredGroups.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4 px-1">
          <span><span className="font-semibold text-gray-700">{filteredGroups.length}</span> proveedor{filteredGroups.length !== 1 ? 'es' : ''}</span>
          <span><span className="font-semibold text-gray-700">{filteredGroups.reduce((s, g) => s + g.purchases.length, 0)}</span> compras</span>
          {filteredGroups.some(g => g.hasOverdue) && (
            <span className="flex items-center gap-1 text-red-600 font-medium"><AlertCircle size={12} /> Con pagos vencidos</span>
          )}
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-gray-400 text-sm">Cargando compras...</div>}

      {!isLoading && filteredGroups.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <ShoppingCart size={40} className="mx-auto mb-2 text-gray-300" />
          <div className="text-sm text-gray-400">
            {supplierSearch ? `Sin resultados para "${supplierSearch}"` : 'No hay compras registradas'}
          </div>
        </div>
      )}

      {/* Groups */}
      <div className="space-y-3">
        {filteredGroups.map(group => {
          const isOpen = expanded.has(group.supplier);
          return (
            <div key={group.supplier} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Supplier header */}
              <button onClick={() => toggleSupplier(group.supplier)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                <span className="text-gray-400 flex-shrink-0">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{group.supplier}</span>
                    {group.ruc && <span className="text-xs text-gray-400 font-mono hidden sm:inline">RUC: {group.ruc}</span>}
                    {group.hasOverdue && (
                      <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium">
                        <AlertCircle size={11} /> Vencido
                      </span>
                    )}
                    {group.hasConsolidated && (
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-semibold">Consolidado</span>
                    )}
                  </div>
                  {/* Mobile summary line */}
                  <div className="lg:hidden mt-0.5 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                    <span>{group.purchases.length} compra{group.purchases.length !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>S/ {group.totalCost.toFixed(2)}</span>
                    {group.totalCostUsd > 0 && <span className="text-primary-600">$ {group.totalCostUsd.toFixed(2)}</span>}
                    {(group.totalDebt > 0 || group.totalDebtUsd > 0) && (
                      <span className="text-red-600 font-semibold">
                        · Deuda: {group.totalDebt > 0 ? `S/ ${group.totalDebt.toFixed(2)}` : ''}{group.totalDebtUsd > 0 ? ` $ ${group.totalDebtUsd.toFixed(2)}` : ''}
                      </span>
                    )}
                    {group.totalDebt === 0 && group.totalDebtUsd === 0 && group.purchases.some(p => p.paymentType === 'CREDITO') && (
                      <span className="text-green-600 flex items-center gap-0.5"><CheckCircle size={10} /> Al día</span>
                    )}
                  </div>
                </div>
                {/* Desktop right side */}
                <div className="hidden lg:flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {group.purchases.length} compra{group.purchases.length !== 1 ? 's' : ''}
                  </span>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Compras</div>
                    <div className="font-semibold text-gray-800 text-sm">S/ {group.totalCost.toFixed(2)}</div>
                    {group.totalCostUsd > 0 && <div className="text-xs text-primary-500 font-medium">$ {group.totalCostUsd.toFixed(2)}</div>}
                  </div>
                  {(group.totalDebt > 0 || group.totalDebtUsd > 0) && (
                    <div className="text-right border-l border-gray-200 pl-4">
                      <div className="text-xs text-red-400">Deuda</div>
                      {group.totalDebt > 0 && <div className="font-bold text-red-600 text-sm">S/ {group.totalDebt.toFixed(2)}</div>}
                      {group.totalDebtUsd > 0 && <div className="text-xs font-bold text-orange-600">$ {group.totalDebtUsd.toFixed(2)}</div>}
                    </div>
                  )}
                  {group.totalDebt === 0 && group.totalDebtUsd === 0 && group.purchases.some(p => p.paymentType === 'CREDITO') && (
                    <div className="text-right border-l border-gray-200 pl-4">
                      <div className="text-xs text-gray-400">Deuda</div>
                      <div className="text-sm font-semibold text-green-600 flex items-center gap-1"><CheckCircle size={13} /> Al día</div>
                    </div>
                  )}
                </div>
              </button>

              {/* Purchase rows */}
              {isOpen && (
                <div className="border-t border-gray-100">

                  {/* ── Mobile cards ── */}
                  <div className="lg:hidden divide-y divide-gray-100">
                    {group.purchases.map(purchase => {
                      const ap = apByPurchaseId[purchase.id];
                      const ps = getPaymentStatus(purchase, ap);
                      const overdue = isOverdue(ap);
                      const rec = receptionCfg[purchase.receptionStatus || 'RECEIVED'];
                      return (
                        <div key={purchase.id}
                          onClick={() => navigate(`/purchases/${purchase.id}`)}
                          className="p-4 hover:bg-primary-50 cursor-pointer transition-colors">
                          {/* Doc + payment badge */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{getDocRef(purchase)}</span>
                              {purchase.documentType && <span className="text-[10px] text-gray-400 uppercase">{purchase.documentType}</span>}
                              {purchase.isHistorical && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold">Histórica</span>}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${ps.cls}`}>{ps.label}</span>
                          </div>
                          {/* Date + company + items */}
                          <div className="text-xs text-gray-500 mb-1.5">
                            {new Date((purchase as any).issueDate || purchase.date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}
                            {' · '}
                            <span className="text-gray-600 font-medium">{getCompanyName(purchase.companyId)}</span>
                            {!purchase.isHistorical && ` · ${purchase.items.length} prod.`}
                          </div>
                          {/* Total + pending */}
                          <div className="flex items-center gap-3 mb-2.5 flex-wrap text-xs">
                            <span className="font-semibold text-gray-800">
                              S/ {purchase.totalCost.toFixed(2)}
                              {purchase.totalCostUsd && <span className="text-primary-600 ml-1">($ {purchase.totalCostUsd.toFixed(2)})</span>}
                            </span>
                            {purchase.paymentType === 'CREDITO' && ap && ap.status !== 'PAID' && ap.status !== 'CONSOLIDATED' && (
                              <span className={`font-medium ${overdue ? 'text-red-600' : 'text-orange-600'}`}>
                                Pend: {ap.currency === 'USD' ? `$ ${ap.pendingAmount.toFixed(2)}` : `S/ ${ap.pendingAmount.toFixed(2)}`}
                                {overdue && <span className="ml-1 text-red-500">(Vencido)</span>}
                              </span>
                            )}
                            {ap?.status === 'PAID' && <span className="text-green-600 flex items-center gap-0.5"><CheckCircle size={11} /> Pagado</span>}
                          </div>
                          {/* Badges + actions */}
                          <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${rec.cls}`}>{rec.label}</span>
                            <div className="flex gap-2">
                              {ap?.status !== 'CONSOLIDATED' && (
                                <button
                                  onClick={() => navigate(`/purchases/${purchase.id}`)}
                                  className="flex items-center gap-1 text-xs text-primary-600 font-medium px-2.5 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                                  <Eye size={12} /> Ver
                                </button>
                              )}
                              <button
                                onClick={e => openRemisionModal(e, purchase)}
                                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${purchase.remisionGuia ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 bg-gray-50 hover:bg-amber-50 hover:text-amber-600'}`}>
                                <FileText size={12} />
                                {purchase.remisionGuia ? `${purchase.remisionGuia.serie}-${purchase.remisionGuia.correlativo}` : 'G.R.'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Desktop table ── */}
                  <table className="hidden lg:table w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Documento', 'F. Emisión', 'Empresa', 'Items', 'Total', 'Pendiente', 'Recepción', 'Estado Pago', ''].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.purchases.map(purchase => {
                        const ap = apByPurchaseId[purchase.id];
                        const ps = getPaymentStatus(purchase, ap);
                        const overdue = isOverdue(ap);
                        const rec = receptionCfg[purchase.receptionStatus || 'RECEIVED'];
                        return (
                          <tr key={purchase.id}
                            onClick={() => navigate(`/purchases/${purchase.id}`)}
                            className="hover:bg-primary-50 cursor-pointer transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{getDocRef(purchase)}</span>
                                {purchase.documentType && <span className="text-[10px] text-gray-400 uppercase">{purchase.documentType}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{new Date((purchase as any).issueDate || purchase.date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1 text-xs text-gray-500"><Building2 size={11} /> {getCompanyName(purchase.companyId)}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {purchase.isHistorical
                                ? <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold">Histórica</span>
                                : `${purchase.items.length} prod.`}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-800 text-xs">S/ {purchase.totalCost.toFixed(2)}</div>
                              {purchase.totalCostUsd && <div className="text-xs font-semibold text-primary-600 flex items-center gap-0.5"><DollarSign size={10} /> {purchase.totalCostUsd.toFixed(2)} USD</div>}
                              {purchase.exchangeRate && purchase.totalCostUsd && <div className="text-[10px] text-gray-400">TC: {purchase.exchangeRate.toFixed(3)}</div>}
                            </td>
                            <td className="px-4 py-3">
                              {purchase.paymentType === 'CONTADO' ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : ap && ap.status !== 'PAID' ? (
                                <div>
                                  {ap.currency === 'USD' ? (
                                    <>
                                      <div className="text-xs font-bold text-red-600 flex items-center gap-0.5"><DollarSign size={10} /> {ap.pendingAmount.toFixed(2)} USD</div>
                                      {ap.totalAmountPen && ap.totalAmount > 0 && <div className="text-[10px] text-gray-400">≈ S/ {(ap.totalAmountPen * (ap.pendingAmount / ap.totalAmount)).toFixed(2)}</div>}
                                    </>
                                  ) : (
                                    <div className={`text-xs font-bold ${overdue ? 'text-red-600' : 'text-orange-600'}`}>S/ {ap.pendingAmount.toFixed(2)}</div>
                                  )}
                                  {overdue && <div className="text-[10px] text-red-500 font-medium">Vencido</div>}
                                </div>
                              ) : ap?.status === 'PAID' ? (
                                <span className="text-xs text-green-600 font-medium flex items-center gap-0.5"><CheckCircle size={11} /> Pagado</span>
                              ) : ap?.status === 'CONSOLIDATED' ? (
                                <span className="text-xs text-purple-600 font-medium">Consolidado</span>
                              ) : (
                                <span className="text-xs text-gray-400">Sin C.P.</span>
                              )}
                            </td>
                            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rec.cls}`}>{rec.label}</span></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>{ps.label}</span>
                                {overdue && <AlertCircle size={13} className="text-red-500" />}
                                {ap?.status === 'PAID' && <CheckCircle size={13} className="text-green-500" />}
                                {ap && ap.status !== 'PAID' && ap.status !== 'CONSOLIDATED' && !overdue && purchase.paymentType === 'CREDITO' && <Clock size={13} className="text-gray-400" />}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {ap?.status !== 'CONSOLIDATED' && (
                                  <button onClick={e => { e.stopPropagation(); navigate(`/purchases/${purchase.id}`); }} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 bg-primary-50 rounded hover:bg-primary-100 transition-colors whitespace-nowrap">
                                    <Eye size={13} /> Ver
                                  </button>
                                )}
                                <button onClick={e => openRemisionModal(e, purchase)} title={purchase.remisionGuia ? `G.R. ${purchase.remisionGuia.serie}-${purchase.remisionGuia.correlativo}` : 'Agregar guía de remisión'} className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors whitespace-nowrap ${purchase.remisionGuia ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:text-amber-600 bg-gray-50 hover:bg-amber-50'}`}>
                                  <FileText size={13} />
                                  {purchase.remisionGuia ? `${purchase.remisionGuia.serie}-${purchase.remisionGuia.correlativo}` : 'G.R.'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Footer */}
                  <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>{group.purchases.filter(p => p.paymentType === 'CONTADO').length} contado</span>
                      <span>{group.purchases.filter(p => p.paymentType === 'CREDITO').length} crédito</span>
                      {(() => { const n = group.purchases.filter(p => apByPurchaseId[p.id]?.status === 'CONSOLIDATED').length; return n > 0 ? <span className="text-purple-600">{n} consolidada{n !== 1 ? 's' : ''}</span> : null; })()}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>
                        Compras: <span className="font-semibold text-gray-700">S/ {group.totalCost.toFixed(2)}</span>
                        {group.totalCostUsd > 0 && <span className="text-primary-600 ml-1">· $ {group.totalCostUsd.toFixed(2)}</span>}
                      </span>
                      {(group.totalDebt > 0 || group.totalDebtUsd > 0) && (
                        <span className="flex items-center gap-1">
                          Deuda:{' '}
                          {group.totalDebt > 0 && <span className="font-bold text-red-600">S/ {group.totalDebt.toFixed(2)}</span>}
                          {group.totalDebtUsd > 0 && <span className="font-bold text-orange-600 ml-1">$ {group.totalDebtUsd.toFixed(2)}</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>



      {/* Modal Guía de Remisión */}
      <Modal
        isOpen={!!remisionModal}
        onClose={() => setRemisionModal(null)}
        title={remisionModal?.existing ? 'Editar Guía de Remisión' : 'Agregar Guía de Remisión'}
        size="default"
      >
        <form onSubmit={handleRemisionSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
              <input
                value={remisionForm.serie}
                onChange={e => setRemisionForm({ ...remisionForm, serie: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="T001"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
              <input
                value={remisionForm.correlativo}
                onChange={e => setRemisionForm({ ...remisionForm, correlativo: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="00000001"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={remisionForm.fecha}
              onChange={e => setRemisionForm({ ...remisionForm, fecha: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={updateRemisionGuia.isPending}
            className="w-full py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm disabled:opacity-50"
          >
            {updateRemisionGuia.isPending ? 'Guardando...' : remisionModal?.existing ? 'Actualizar Guía' : 'Guardar Guía'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
