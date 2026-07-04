import React, { useState, useRef } from 'react';
import { useStock, useStockAlerts, useTransferStock } from '../hooks/useStock';
import { useStockAdjustments, useCreateStockAdjustment } from '../hooks/useStockAdjustments';
import { useProductLots, useExpiringLots } from '../hooks/useProductLots';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useProducts } from '../../products/hooks/useProducts';
import { Modal } from '../../../shared/components/Modal';
import { Pagination } from '../../../shared/components/Pagination';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import {
  Package, ArrowRightLeft, AlertTriangle, Trash2, Plus, ClipboardList,
  ChevronDown, ChevronUp, Search, CalendarClock, Boxes,
  FileSpreadsheet, Download, Upload, SlidersHorizontal, Truck, X,
} from 'lucide-react';
import type { Stock, Company, Product, StockAdjustment, ProductLot } from '../../../shared/types';

type ImportRow = { excelName: string; quantity: number; matched: Product | null };

export function StockPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'lots' | 'adjustments' | 'transfers'>('inventory');
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjPage, setAdjPage] = useState(1);
  const [showLowStockDetail, setShowLowStockDetail] = useState(false);
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState('');
  const [showStockFilters, setShowStockFilters] = useState(false);
  const [showExpiringDetail, setShowExpiringDetail] = useState(false);
  const [lotFilter, setLotFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');
  const [expandedStock, setExpandedStock] = useState<Record<string, boolean>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importCompanyId, setImportCompanyId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const { data: companies } = useCompanies();
  const { data: productsData } = useProducts({ limit: 200 });
  const { data: allProductsData } = useProducts({ limit: 1000 });
  const { data, isLoading } = useStock(companyId, { page: 1, limit: 1000 });
  const { data: alerts } = useStockAlerts(companyId, 10);
  const transferStock = useTransferStock();
  const { data: adjustmentsData, isLoading: adjLoading } = useStockAdjustments({ page: adjPage, limit: 20, companyId: companyId || undefined });
  const createAdjustment = useCreateStockAdjustment();
  const { data: lotsData, isLoading: lotsLoading } = useProductLots(companyId);
  const { data: expiringData } = useExpiringLots(companyId, 30);

  const [transferForm, setTransferForm] = useState({ fromCompanyId: '', toCompanyId: '', items: [{ productId: '', quantity: 0, lotAllocations: [] as { lotId: string; quantity: number }[] }] });
  const { data: transferSourceLotsData } = useProductLots(transferForm.fromCompanyId);
  const transferSourceAllLots: ProductLot[] = Array.isArray(transferSourceLotsData) ? transferSourceLotsData : [];
  const transferSourceLotsByProduct = transferSourceAllLots.reduce<Record<string, ProductLot[]>>((acc, l) => {
    if (!acc[l.productId]) acc[l.productId] = [];
    acc[l.productId].push(l);
    return acc;
  }, {});
  const [adjForm, setAdjForm] = useState({ productId: '', companyId: '', type: 'INCREASE' as 'INCREASE' | 'DECREASE', quantity: 0, reason: '', lotNumber: '', expirationDate: '' });

  const companyList = Array.isArray(companies) ? companies : [];
  const products = productsData?.data || [];
  const allProducts: Product[] = allProductsData?.data || [];

  const stockRecords: Stock[] = data?.data || [];
  const stockMap = new Map(stockRecords.map((s: Stock) => [s.productId, s]));
  const allLots: ProductLot[] = Array.isArray(lotsData) ? lotsData : [];
  const expiringLots: ProductLot[] = Array.isArray(expiringData) ? expiringData : [];

  // For tracksLot products, the authoritative quantity is the sum of active lot currentQuantity,
  // since the Stock table can fall out of sync with manually-created lots.
  const lotQtyByProduct = allLots.reduce<Record<string, number>>((acc, l) => {
    if (l.currentQuantity > 0) acc[l.productId] = (acc[l.productId] || 0) + l.currentQuantity;
    return acc;
  }, {});

  const srcProducts = (allProducts.length > 0 ? allProducts : products).filter((p: Product) => p.isActive);
  const mergedStockItems: Stock[] = srcProducts
    .map((p: Product) => {
      const record = stockMap.get(p.id) ?? ({ id: `v-${p.id}`, productId: p.id, companyId, quantity: 0, lastUpdated: '' } as Stock);
      if (p.tracksLot) return { ...record, quantity: lotQtyByProduct[p.id] ?? 0 };
      return record;
    })
    .sort((a: Stock, b: Stock) => {
      if (a.quantity > 0 && b.quantity === 0) return -1;
      if (a.quantity === 0 && b.quantity > 0) return 1;
      return 0;
    });

  const ITEMS_PER_PAGE = 20;
  const alertList = Array.isArray(alerts) ? alerts : [];
  const adjustments = adjustmentsData?.data || [];
  const adjTotal = adjustmentsData?.total || 0;

  const daysUntil = (date?: string) => {
    if (!date) return Infinity;
    const exp = new Date(date);
    const today = new Date();
    // today: use local parts (browser runs in Lima timezone)
    // exp: use UTC parts (dates are stored as UTC noon)
    const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const expMs = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
    return Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
  };
  const lotStatus = (lot: ProductLot): { label: string; color: string; days: number } => {
    const d = daysUntil(lot.expirationDate);
    if (d === Infinity) return { label: 'Sin fecha', color: 'bg-gray-100 text-gray-600 border-gray-200', days: d };
    if (d < 0) return { label: `Vencido hace ${-d}d`, color: 'bg-red-100 text-red-700 border-red-200', days: d };
    if (d <= 7) return { label: `${d}d`, color: 'bg-orange-100 text-orange-700 border-orange-200', days: d };
    if (d <= 30) return { label: `${d}d`, color: 'bg-yellow-100 text-yellow-800 border-yellow-200', days: d };
    return { label: `${d}d`, color: 'bg-green-100 text-green-700 border-green-200', days: d };
  };

  const filteredLots = allLots.filter(l => {
    if (lotFilter === 'all') return true;
    const d = daysUntil(l.expirationDate);
    if (lotFilter === 'active') return l.currentQuantity > 0 && d > 30;
    if (lotFilter === 'expiring') return l.currentQuantity > 0 && d >= 0 && d <= 30;
    if (lotFilter === 'expired') return d < 0;
    return true;
  }).sort((a, b) => daysUntil(a.expirationDate) - daysUntil(b.expirationDate));

  const lotsByProduct = allLots.reduce<Record<string, ProductLot[]>>((acc, l) => {
    if (!acc[l.productId]) acc[l.productId] = [];
    acc[l.productId].push(l);
    return acc;
  }, {});

  const getProductName = (id: string) => allProducts.find((p: Product) => p.id === id)?.name || products.find((p: Product) => p.id === id)?.name || 'N/A';
  const getProductUnit = (id: string) => allProducts.find((p: Product) => p.id === id)?.unit || products.find((p: Product) => p.id === id)?.unit || '';
  const getProductLocation = (id: string) => allProducts.find((p: Product) => p.id === id)?.location || products.find((p: Product) => p.id === id)?.location || '';
  const getCompanyName = (id: string) => companyList.find((c: Company) => c.id === id)?.name || 'N/A';

  const filteredStockItems: Stock[] = mergedStockItems.filter((s) => {
    if (nameFilter.trim() && !getProductName(s.productId).toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
    if (supplierFilter.trim() || ingredientFilter.trim()) {
      const product = allProducts.find((p: Product) => p.id === s.productId) || products.find((p: Product) => p.id === s.productId);
      if (supplierFilter.trim() && !(product?.supplier || '').toLowerCase().includes(supplierFilter.trim().toLowerCase())) return false;
      if (ingredientFilter.trim()) {
        const q = ingredientFilter.trim().toLowerCase();
        const single = (product?.activeIngredient || '').toLowerCase();
        const multi = (product?.activeIngredients || []).map((i) => i.name || '').join(' ').toLowerCase();
        if (!single.includes(q) && !multi.includes(q)) return false;
      }
    }
    return true;
  });

  const total = filteredStockItems.length;
  const stockItems = filteredStockItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const qtyBadge = (qty: number) => {
    if (qty === 0) return <span className="inline-flex items-center px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">Agotado</span>;
    if (qty <= 5) return <span className="inline-flex items-center px-2.5 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-200">{qty}</span>;
    if (qty <= 10) return <span className="inline-flex items-center px-2.5 py-0.5 bg-orange-50 text-orange-700 rounded-full text-xs font-semibold border border-orange-200">{qty}</span>;
    if (qty <= 20) return <span className="inline-flex items-center px-2.5 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium border border-yellow-200">{qty}</span>;
    return <span className="inline-flex items-center px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">{qty}</span>;
  };

  const openTransfer = () => { setTransferForm({ fromCompanyId: companyId || '', toCompanyId: '', items: [{ productId: '', quantity: 0, lotAllocations: [] }] }); setShowTransfer(true); };
  const openAdjustment = (preset?: { productId?: string; companyId?: string }) => {
    setAdjForm({ productId: preset?.productId || '', companyId: preset?.companyId || companyId || (companyList[0]?.id || ''), type: 'INCREASE', quantity: 0, reason: '', lotNumber: '', expirationDate: '' });
    setShowAdjustment(true);
  };

  const addTransferItem = () => setTransferForm(prev => ({ ...prev, items: [...prev.items, { productId: '', quantity: 0, lotAllocations: [] }] }));
  const transferSourceLots = (productId: string): ProductLot[] => (transferSourceLotsByProduct[productId] || []).filter(l => l.currentQuantity > 0);
  const autoFifoAllocate = (idx: number) => {
    setTransferForm(prev => {
      const items = [...prev.items];
      const it = items[idx];
      const src = transferSourceLots(it.productId).sort((a, b) => {
        const da = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const db = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        return da - db;
      });
      let remaining = it.quantity;
      const allocations: { lotId: string; quantity: number }[] = [];
      for (const lot of src) {
        if (remaining <= 0) break;
        const take = Math.min(lot.currentQuantity, remaining);
        allocations.push({ lotId: lot.id, quantity: take });
        remaining -= take;
      }
      items[idx] = { ...it, lotAllocations: allocations };
      return { ...prev, items };
    });
  };
  const updateAllocation = (itemIdx: number, lotId: string, quantity: number) => {
    setTransferForm(prev => {
      const items = [...prev.items];
      const allocs = [...(items[itemIdx].lotAllocations || [])];
      const i = allocs.findIndex(a => a.lotId === lotId);
      if (quantity <= 0) { if (i >= 0) allocs.splice(i, 1); }
      else { if (i >= 0) allocs[i] = { lotId, quantity }; else allocs.push({ lotId, quantity }); }
      items[itemIdx] = { ...items[itemIdx], lotAllocations: allocs };
      return { ...prev, items };
    });
  };
  const removeTransferItem = (idx: number) => setTransferForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  const updateTransferItem = (idx: number, field: string, value: any) => setTransferForm(prev => { const items = [...prev.items]; items[idx] = { ...items[idx], [field]: value }; return { ...prev, items }; });

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const it of transferForm.items) {
      const product = products.find((p: Product) => p.id === it.productId);
      if (product?.tracksLot) {
        const sum = (it.lotAllocations || []).reduce((s, a) => s + a.quantity, 0);
        if (Math.abs(sum - it.quantity) > 0.0001) {
          const { default: toast } = await import('react-hot-toast');
          toast.error(`Para ${product.name} la suma de lotes (${sum}) debe coincidir con la cantidad (${it.quantity})`);
          return;
        }
      }
    }
    const payload = {
      ...transferForm,
      items: transferForm.items.map(it => {
        const product = products.find((p: Product) => p.id === it.productId);
        return product?.tracksLot && it.lotAllocations?.length
          ? { productId: it.productId, quantity: it.quantity, lotAllocations: it.lotAllocations }
          : { productId: it.productId, quantity: it.quantity };
      }),
    };
    await transferStock.mutateAsync(payload);
    setShowTransfer(false);
  };
  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...adjForm };
    if (!payload.lotNumber) delete payload.lotNumber;
    if (!payload.expirationDate) delete payload.expirationDate;
    await createAdjustment.mutateAsync(payload);
    setShowAdjustment(false);
  };

  const downloadTemplate = () => {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['Producto', 'Cantidad'],
        ['Fertilizante NPK 20-20-20', 50],
        ['Urea 46%', 30],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      XLSX.writeFile(wb, 'plantilla_stock.xlsx');
    });
  };

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = (rows[0] || []).map((h: any) => String(h).toLowerCase().trim());
    const nameCol = header.findIndex((h: string) => /producto|nombre|descrip/.test(h));
    const qtyCol = header.findIndex((h: string) => /cantidad|stock|qty/.test(h));
    if (nameCol === -1 || qtyCol === -1) {
      const { default: toast } = await import('react-hot-toast');
      toast.error('El Excel debe tener columnas "Producto" y "Cantidad"');
      return;
    }
    const src = allProducts.length > 0 ? allProducts : products;
    const parsed: ImportRow[] = rows.slice(1)
      .filter((r: any[]) => r[nameCol] != null && String(r[nameCol]).trim())
      .map((r: any[]) => {
        const name = String(r[nameCol]).trim();
        const qty = parseFloat(String(r[qtyCol] ?? 0)) || 0;
        const nl = name.toLowerCase();
        const matched =
          src.find((p: Product) => p.name.toLowerCase() === nl) ||
          src.find((p: Product) => p.name.toLowerCase().includes(nl)) ||
          src.find((p: Product) => nl.includes(p.name.toLowerCase())) ||
          null;
        return { excelName: name, quantity: qty, matched };
      });
    setImportRows(parsed);
  };

  const handleImport = async () => {
    const toImport = importRows.filter(r => r.matched && r.quantity > 0);
    if (!importCompanyId || toImport.length === 0) return;
    setIsImporting(true);
    try {
      for (const row of toImport) {
        await createAdjustment.mutateAsync({
          productId: row.matched!.id,
          companyId: importCompanyId,
          type: 'INCREASE',
          quantity: row.quantity,
          reason: 'Importación Excel',
        });
      }
      const { default: toast } = await import('react-hot-toast');
      toast.success(`${toImport.length} productos importados al stock`);
      setShowImportModal(false);
      setImportRows([]);
      if (importFileRef.current) importFileRef.current.value = '';
    } finally {
      setIsImporting(false);
    }
  };

  React.useEffect(() => { if (!companyId && companyList.length > 0) setCompanyId(companyList[0].id); }, [companyList, companyId]);

  const tabs = [
    { id: 'inventory' as const, label: 'Inventario', icon: Package },
    { id: 'lots' as const, label: 'Lotes', icon: Boxes },
    { id: 'adjustments' as const, label: 'Ajustes', icon: ClipboardList },
    { id: 'transfers' as const, label: 'Transferencias', icon: ArrowRightLeft },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <Package size={20} className="text-primary-600" />
            </div>
            Stock
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 ml-11">Control de inventario y lotes</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
          <button
            onClick={() => { setImportCompanyId(companyId); setImportRows([]); setShowImportModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors shadow-sm whitespace-nowrap flex-shrink-0">
            <FileSpreadsheet size={15} /> Importar
          </button>
          {activeTab === 'inventory' && (
            <>
              <button onClick={() => openAdjustment()} className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium transition-colors shadow-sm whitespace-nowrap flex-shrink-0">
                <Plus size={15} /> Ajuste
              </button>
              <button onClick={openTransfer} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm whitespace-nowrap flex-shrink-0">
                <ArrowRightLeft size={15} /> Transferir
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Productos</span>
            <Package size={14} className="text-gray-300" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{stockItems.length}</div>
          <div className="text-xs text-gray-400 mt-0.5 truncate">{getCompanyName(companyId)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidades</span>
            <Boxes size={14} className="text-gray-300" />
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {stockItems.reduce((s: number, i: Stock) => s + i.quantity, 0).toLocaleString('es-PE')}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">en inventario</div>
        </div>
        <div className={`bg-white rounded-xl border shadow-card p-4 ${alertList.length > 0 ? 'border-red-100' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock Bajo</span>
            <AlertTriangle size={14} className={alertList.length > 0 ? 'text-red-400' : 'text-gray-300'} />
          </div>
          <div className={`text-2xl font-bold ${alertList.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {alertList.length}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">productos críticos</div>
        </div>
        <div className={`bg-white rounded-xl border shadow-card p-4 ${expiringLots.length > 0 ? 'border-orange-100' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por Vencer</span>
            <CalendarClock size={14} className={expiringLots.length > 0 ? 'text-orange-400' : 'text-gray-300'} />
          </div>
          <div className={`text-2xl font-bold ${expiringLots.length > 0 ? 'text-orange-600' : 'text-gray-800'}`}>
            {expiringLots.length}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">lotes · próx. 30 días</div>
        </div>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
        {tabs.map(tab => { const Icon = tab.icon; return (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setPage(1); setAdjPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ${activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            <Icon size={15} />{tab.label}
          </button>
        ); })}
      </div>

      {/* Low stock alert banner */}
      {alertList.length > 0 && activeTab === 'inventory' && (() => {
        type AlertItem = Stock & { _name: string };
        const enriched: AlertItem[] = alertList.map((a: Stock) => ({ ...a, _name: getProductName(a.productId) }));
        const orphan = enriched.filter(a => a._name === 'N/A');
        const known = enriched.filter(a => a._name !== 'N/A');
        const outOfStock = known.filter(a => a.quantity === 0).sort((a, b) => a._name.localeCompare(b._name));
        const critical = known.filter(a => a.quantity > 0).sort((a, b) => a.quantity - b.quantity || a._name.localeCompare(b._name));
        const MAX_VISIBLE = 30;
        const visibleCritical = showAllLowStock ? critical : critical.slice(0, MAX_VISIBLE);
        const hiddenCount = Math.max(0, critical.length - MAX_VISIBLE);
        return (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <button onClick={() => setShowLowStockDetail(v => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-red-100/60 transition-colors">
              <div className="flex items-center gap-3 text-red-900">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={16} className="text-red-600" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Stock bajo — {alertList.length} productos</div>
                  <div className="text-xs text-red-700 mt-0.5">
                    {outOfStock.length > 0 && <span className="font-medium">{outOfStock.length} agotados</span>}
                    {outOfStock.length > 0 && critical.length > 0 && <span className="mx-1">·</span>}
                    {critical.length > 0 && <span>{critical.length} con stock crítico</span>}
                    {orphan.length > 0 && <span className="ml-1 text-red-500">· {orphan.length} sin referencia</span>}
                  </div>
                </div>
              </div>
              <span className="flex items-center gap-1 text-red-700 text-xs font-medium flex-shrink-0 bg-red-100 px-2.5 py-1 rounded-full">
                {showLowStockDetail ? <><ChevronUp size={13} /> Ocultar</> : <><ChevronDown size={13} /> Ver detalle</>}
              </span>
            </button>
            {showLowStockDetail && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-red-200">
                {outOfStock.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-2">Agotados ({outOfStock.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {outOfStock.map((a) => (
                        <button key={`${a.productId}-${a.companyId}`} onClick={() => openAdjustment({ productId: a.productId, companyId: a.companyId })}
                          className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-medium border border-red-200 transition-colors" title="Click para ajustar stock">
                          {a._name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {critical.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-orange-700 uppercase tracking-widest mb-2">Crítico ({critical.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleCritical.map((a) => (
                        <button key={`${a.productId}-${a.companyId}`} onClick={() => openAdjustment({ productId: a.productId, companyId: a.companyId })}
                          className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-900 rounded-lg text-xs font-medium border border-orange-200 transition-colors" title="Click para ajustar stock">
                          {a._name} <span className="font-bold ml-1">{a.quantity}</span>
                        </button>
                      ))}
                      {!showAllLowStock && hiddenCount > 0 && (
                        <button onClick={() => setShowAllLowStock(true)} className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium border border-gray-200">
                          +{hiddenCount} más
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {orphan.length > 0 && (
                  <div className="pt-2 border-t border-red-100 text-xs text-red-500">
                    {orphan.length} registro{orphan.length > 1 ? 's' : ''} sin referencia de producto en catálogo.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Expiring lots banner */}
      {expiringLots.length > 0 && (activeTab === 'inventory' || activeTab === 'lots') && (() => {
        const expired = expiringLots.filter(l => daysUntil(l.expirationDate) < 0);
        const sevenDays = expiringLots.filter(l => { const d = daysUntil(l.expirationDate); return d >= 0 && d <= 7; });
        const thirtyDays = expiringLots.filter(l => { const d = daysUntil(l.expirationDate); return d > 7 && d <= 30; });
        return (
          <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
            <button onClick={() => setShowExpiringDetail(v => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-orange-100/60 transition-colors">
              <div className="flex items-center gap-3 text-orange-900">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CalendarClock size={16} className="text-orange-600" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Lotes por vencer — {expiringLots.length}</div>
                  <div className="text-xs text-orange-700 mt-0.5">
                    {expired.length > 0 && <span className="font-medium text-red-700">{expired.length} vencidos</span>}
                    {expired.length > 0 && (sevenDays.length + thirtyDays.length) > 0 && <span className="mx-1">·</span>}
                    {sevenDays.length > 0 && <span>{sevenDays.length} en 7 días</span>}
                    {sevenDays.length > 0 && thirtyDays.length > 0 && <span className="mx-1">·</span>}
                    {thirtyDays.length > 0 && <span>{thirtyDays.length} en 30 días</span>}
                  </div>
                </div>
              </div>
              <span className="flex items-center gap-1 text-orange-700 text-xs font-medium flex-shrink-0 bg-orange-100 px-2.5 py-1 rounded-full">
                {showExpiringDetail ? <><ChevronUp size={13} /> Ocultar</> : <><ChevronDown size={13} /> Ver detalle</>}
              </span>
            </button>
            {showExpiringDetail && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-orange-200">
                {[
                  { label: 'Vencidos', list: expired, tone: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200' },
                  { label: 'Próximos 7 días', list: sevenDays, tone: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200' },
                  { label: 'Próximos 30 días', list: thirtyDays, tone: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200' },
                ].filter(g => g.list.length > 0).map(g => (
                  <div key={g.label}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-gray-600">{g.label} ({g.list.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.list.map((l) => {
                        const st = lotStatus(l);
                        return (
                          <button key={l.id} onClick={() => { setActiveTab('lots'); setLotFilter(g.label === 'Vencidos' ? 'expired' : 'expiring'); }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${g.tone}`} title="Ir a la pestaña de lotes">
                            {getProductName(l.productId)} · <span className="font-mono">{l.lotNumber}</span> · {st.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Company filter pills */}
      {(activeTab === 'inventory' || activeTab === 'adjustments' || activeTab === 'lots') && (
        <div className="mb-4 flex gap-2 flex-wrap">
          {companyList.map((c: Company) => (
            <button key={c.id} onClick={() => { setCompanyId(c.id); setPage(1); setAdjPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${companyId === c.id ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Inventory tab ── */}
      {activeTab === 'inventory' && (
        <>
          {/* Filter bar */}
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" placeholder="Buscar por nombre..." value={nameFilter}
                  onChange={(e) => { setNameFilter(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                />
              </div>
              <button
                onClick={() => setShowStockFilters(v => !v)}
                className={`lg:hidden flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${showStockFilters ? 'bg-primary-600 text-white border-primary-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                <SlidersHorizontal size={15} />
                Filtros
                {(supplierFilter || ingredientFilter) && (
                  <span className={`text-xs font-bold ${showStockFilters ? 'text-white' : 'text-primary-600'}`}>
                    {[supplierFilter, ingredientFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
            <div className={`${showStockFilters ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row gap-2`}>
              <div className="relative flex-1">
                <Truck size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" placeholder="Proveedor..." value={supplierFilter}
                  onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                />
              </div>
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" placeholder="Ingrediente activo..." value={ingredientFilter}
                  onChange={(e) => { setIngredientFilter(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
                />
              </div>
              {(supplierFilter || ingredientFilter) && (
                <button
                  onClick={() => { setSupplierFilter(''); setIngredientFilter(''); setPage(1); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <X size={12} /> Limpiar filtros
                </button>
              )}
            </div>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {isLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
            ) : stockItems.length === 0 ? (
              <div className="py-16 text-center"><Package size={32} className="mx-auto mb-2 text-gray-200" /><div className="text-gray-400 text-sm">Sin registros de stock</div></div>
            ) : stockItems.map((item: Stock) => {
              const product = products.find((p: Product) => p.id === item.productId) || allProducts.find((p: Product) => p.id === item.productId);
              const productLots = lotsByProduct[item.productId] || [];
              const hasLots = productLots.length > 0;
              const isExpanded = expandedStock[item.id];
              const location = getProductLocation(item.productId);
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 text-sm leading-snug">{getProductName(item.productId)}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {product?.tracksLot && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-semibold">LOTES</span>}
                        {location && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-semibold">{location}</span>}
                        <span className="text-[11px] text-gray-400">{getProductUnit(item.productId)}</span>
                      </div>
                    </div>
                    {qtyBadge(item.quantity)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {hasLots ? (
                      <button onClick={() => setExpandedStock(s => ({ ...s, [item.id]: !s[item.id] }))}
                        className="flex items-center gap-1 text-xs text-primary-600 font-medium px-2.5 py-1.5 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">
                        {isExpanded ? <><ChevronUp size={12} /> Ocultar lotes</> : <><ChevronDown size={12} /> Ver lotes</>}
                      </button>
                    ) : <div />}
                    <button onClick={() => openAdjustment({ productId: item.productId, companyId: item.companyId })}
                      className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-medium border border-orange-200 transition-colors">
                      Ajustar
                    </button>
                  </div>
                  {hasLots && isExpanded && (
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lotes activos</div>
                      {productLots.filter(l => l.currentQuantity > 0).map(l => {
                        const st = lotStatus(l);
                        return (
                          <div key={l.id} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-wrap">
                            <span className="font-mono text-gray-700 font-medium">{l.lotNumber}</span>
                            <span className="text-gray-500">{l.currentQuantity}<span className="text-gray-400">/{l.initialQuantity}</span></span>
                            <span className="text-gray-500 flex-1">{l.expirationDate ? `Vence ${new Date(l.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}` : 'Sin vencimiento'}</span>
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-xl shadow-card overflow-hidden border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Últ. actualización</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400"><div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" /> Cargando...</div></td></tr>
                ) : stockItems.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10"><Package size={32} className="mx-auto mb-2 text-gray-200" /><div className="text-gray-400 text-sm">Sin registros de stock</div></td></tr>
                ) : stockItems.map((item: Stock) => {
                  const product = products.find((p: Product) => p.id === item.productId) || allProducts.find((p: Product) => p.id === item.productId);
                  const productLots = lotsByProduct[item.productId] || [];
                  const hasLots = productLots.length > 0;
                  const isExpanded = expandedStock[item.id];
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-primary-50/40 transition-colors">
                        <td className="px-2">{hasLots && (<button onClick={() => setExpandedStock(s => ({ ...s, [item.id]: !s[item.id] }))} className="p-1.5 text-gray-300 hover:text-primary-500 rounded transition-colors">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>)}</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2 flex-wrap"><span className="font-medium text-gray-800">{getProductName(item.productId)}</span>{product?.tracksLot && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-semibold">LOTES</span>}{getProductLocation(item.productId) && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-semibold">{getProductLocation(item.productId)}</span>}</div></td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{getProductUnit(item.productId)}</td>
                        <td className="px-4 py-3">{qtyBadge(item.quantity)}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{item.lastUpdated && !isNaN(new Date(item.lastUpdated).getTime()) ? new Date(item.lastUpdated).toLocaleDateString('es-PE') : '—'}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => openAdjustment({ productId: item.productId, companyId: item.companyId })} className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-medium border border-orange-200 transition-colors">Ajustar</button></td>
                      </tr>
                      {hasLots && isExpanded && (
                        <tr className="bg-blue-50/30"><td></td><td colSpan={5} className="px-4 py-3">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Lotes activos</div>
                          <div className="space-y-1.5">{productLots.filter(l => l.currentQuantity > 0).map(l => { const st = lotStatus(l); return (<div key={l.id} className="flex items-center gap-3 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2"><span className="font-mono text-gray-700 font-medium">{l.lotNumber}</span><span className="text-gray-300">·</span><span className="text-gray-600">{l.currentQuantity} <span className="text-gray-400">/ {l.initialQuantity}</span></span><span className="text-gray-300">·</span><span className="text-gray-500">{l.expirationDate ? `Vence ${new Date(l.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}` : 'Sin vencimiento'}</span><span className={`ml-auto px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.color}`}>{st.label}</span></div>); })}</div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={setPage} />
        </>
      )}

      {/* ── Lots tab ── */}
      {activeTab === 'lots' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {([{ id: 'all', label: 'Todos' }, { id: 'active', label: 'Activos' }, { id: 'expiring', label: 'Por vencer (30d)' }, { id: 'expired', label: 'Vencidos' }] as const).map(f => (
              <button key={f.id} onClick={() => setLotFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${lotFilter === f.id ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {lotsLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
            ) : filteredLots.length === 0 ? (
              <div className="py-16 text-center"><Boxes size={32} className="mx-auto mb-2 text-gray-200" /><div className="text-gray-400 text-sm">Sin lotes para este filtro</div></div>
            ) : filteredLots.map(l => {
              const st = lotStatus(l);
              return (
                <div key={l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-medium text-gray-800 text-sm leading-snug">{getProductName(l.productId)}</span>
                    <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold flex-shrink-0 ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span className="font-mono font-medium text-gray-700">{l.lotNumber}</span>
                    <span>Actual: <span className="font-semibold text-gray-800">{l.currentQuantity}</span><span className="text-gray-400">/{l.initialQuantity}</span></span>
                    {l.expirationDate && <span>Vence: <span className="font-medium text-gray-700">{new Date(l.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</span></span>}
                    {l.receivedAt && <span className="text-gray-400">Rec: {new Date(l.receivedAt).toLocaleDateString('es-PE')}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-xl shadow-card overflow-hidden border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lote</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actual / Inicial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Recepción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lotsLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400"><div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" /> Cargando...</div></td></tr>
                ) : filteredLots.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10"><Boxes size={32} className="mx-auto mb-2 text-gray-200" /><div className="text-gray-400 text-sm">Sin lotes para este filtro</div></td></tr>
                ) : filteredLots.map(l => {
                  const st = lotStatus(l);
                  return (
                    <tr key={l.id} className="hover:bg-primary-50/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{getProductName(l.productId)}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 text-xs">{l.lotNumber}</td>
                      <td className="px-4 py-3 text-right"><span className="font-semibold text-gray-800">{l.currentQuantity}</span><span className="text-gray-400"> / {l.initialQuantity}</span></td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{l.expirationDate ? new Date(l.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${st.color}`}>{st.label}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{l.receivedAt ? new Date(l.receivedAt).toLocaleDateString('es-PE') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Adjustments tab ── */}
      {activeTab === 'adjustments' && (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => openAdjustment()} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium shadow-sm transition-colors">
              <Plus size={16} /> Nuevo Ajuste
            </button>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {adjLoading ? (
              <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
            ) : adjustments.length === 0 ? (
              <div className="py-16 text-center"><ClipboardList size={32} className="mx-auto mb-2 text-gray-200" /><div className="text-gray-400 text-sm">Sin ajustes registrados</div></div>
            ) : adjustments.map((item: StockAdjustment) => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 text-sm leading-snug">{getProductName(item.productId)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{new Date(item.date).toLocaleDateString('es-PE')} · {getCompanyName(item.companyId)}</div>
                  </div>
                  {item.type === 'INCREASE'
                    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-semibold border border-green-200 flex-shrink-0">Aumento</span>
                    : <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold border border-red-200 flex-shrink-0">Disminución</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Cant: <span className="font-semibold text-gray-800">{item.quantity}</span></span>
                  <span className="text-gray-400">{item.previousQuantity} → <span className="font-semibold text-gray-700">{item.newQuantity}</span></span>
                </div>
                {item.reason && <div className="text-xs text-gray-400 mt-1 truncate">{item.reason}</div>}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-xl shadow-card overflow-hidden border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Cant.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Anterior → Nuevo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Razón</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adjLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400"><div className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" /> Cargando...</div></td></tr>
                ) : adjustments.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10"><ClipboardList size={32} className="mx-auto mb-2 text-gray-200" /><div className="text-gray-400 text-sm">Sin ajustes registrados</div></td></tr>
                ) : adjustments.map((item: StockAdjustment) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(item.date).toLocaleDateString('es-PE')}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{getProductName(item.productId)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{getCompanyName(item.companyId)}</td>
                    <td className="px-4 py-3">{item.type === 'INCREASE' ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-semibold border border-green-200">Aumento</span> : <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold border border-red-200">Disminución</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">{item.previousQuantity} → <span className="font-semibold text-gray-700">{item.newQuantity}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={adjPage} totalPages={Math.ceil(adjTotal / 20)} onPageChange={setAdjPage} />
        </>
      )}

      {/* ── Transfers tab ── */}
      {activeTab === 'transfers' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card p-12 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ArrowRightLeft size={28} className="text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Transferencias entre sucursales</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
            Mueve productos entre empresas manteniendo la trazabilidad de lotes con asignación FIFO automática.
          </p>
          <button
            onClick={() => { setActiveTab('inventory'); setTimeout(openTransfer, 50); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm">
            <ArrowRightLeft size={16} /> Nueva Transferencia
          </button>
        </div>
      )}

      {/* ── Modal: Transfer ── */}
      <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Transferir Stock entre Empresas" size="lg">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <select value={transferForm.fromCompanyId} onChange={(e) => setTransferForm({ ...transferForm, fromCompanyId: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required>
                <option value="">Seleccionar...</option>
                {companyList.map((c: Company) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Hacia</label>
              <select value={transferForm.toCompanyId} onChange={(e) => setTransferForm({ ...transferForm, toCompanyId: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required>
                <option value="">Seleccionar...</option>
                {companyList.filter((c: Company) => c.id !== transferForm.fromCompanyId).map((c: Company) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-gray-700">Productos</label><button type="button" onClick={addTransferItem} className="text-sm text-primary-600 hover:text-primary-800">+ Agregar</button></div>
            <div className="space-y-2">
              {transferForm.items.map((item, idx) => {
                const product = products.find((p: Product) => p.id === item.productId);
                const hasLots = product?.tracksLot;
                const sourceLots = hasLots ? transferSourceLots(item.productId) : [];
                const allocSum = (item.lotAllocations || []).reduce((s, a) => s + a.quantity, 0);
                const mismatch = hasLots && item.quantity > 0 && Math.abs(allocSum - item.quantity) > 0.0001;
                return (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <SearchableSelect options={products.map((p: Product) => ({ value: p.id, label: p.name }))} value={item.productId}
                          onChange={(v) => { updateTransferItem(idx, 'productId', v); updateTransferItem(idx, 'lotAllocations', []); }} placeholder="Buscar producto..." required />
                      </div>
                      <input type="number" placeholder="Cantidad" min="0.01" step="0.01" value={item.quantity || ''}
                        onChange={(e) => updateTransferItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-28 px-2 py-1.5 border rounded text-sm" required />
                      {transferForm.items.length > 1 && <button type="button" onClick={() => removeTransferItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
                    </div>
                    {hasLots && item.productId && (
                      <div className="mt-2 border-t border-gray-200 pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-600">Lotes a transferir <span className="text-red-500">*</span></span>
                          <button type="button" onClick={() => autoFifoAllocate(idx)} disabled={!item.quantity || sourceLots.length === 0} className="text-xs text-primary-600 hover:text-primary-800 disabled:opacity-40">Auto FIFO</button>
                        </div>
                        {sourceLots.length === 0 ? (
                          <div className="text-xs text-gray-400 italic py-1">No hay lotes disponibles en la sucursal origen.</div>
                        ) : (
                          <div className="space-y-1">
                            {sourceLots.map((lot) => {
                              const alloc = item.lotAllocations?.find(a => a.lotId === lot.id)?.quantity || 0;
                              const st = lotStatus(lot);
                              return (
                                <div key={lot.id} className="flex items-center gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1">
                                  <span className="font-mono text-gray-700 w-32 truncate">{lot.lotNumber}</span>
                                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${st.color}`}>{st.label}</span>
                                  <span className="text-gray-500 flex-1">Disp: {lot.currentQuantity}</span>
                                  <input type="number" min="0" max={lot.currentQuantity} step="0.01" value={alloc || ''}
                                    onChange={(e) => updateAllocation(idx, lot.id, parseFloat(e.target.value) || 0)} placeholder="0" className="w-20 px-1.5 py-0.5 border rounded text-xs" />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className={`mt-1 text-xs flex justify-between ${mismatch ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          <span>Suma asignada</span><span>{allocSum} / {item.quantity || 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <button type="submit" disabled={transferStock.isPending} className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm">
            {transferStock.isPending ? 'Transfiriendo...' : 'Realizar Transferencia'}
          </button>
        </form>
      </Modal>

      {/* ── Modal: Adjustment ── */}
      <Modal isOpen={showAdjustment} onClose={() => setShowAdjustment(false)} title="Ajuste de Stock">
        <form onSubmit={handleAdjustment} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select value={adjForm.companyId} onChange={(e) => setAdjForm({ ...adjForm, companyId: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required>
              <option value="">Seleccionar...</option>
              {companyList.map((c: Company) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
            <SearchableSelect
              options={allProducts.length > 0 ? allProducts.map((p: Product) => ({ value: p.id, label: p.name })) : products.map((p: Product) => ({ value: p.id, label: p.name }))}
              value={adjForm.productId}
              onChange={(v) => setAdjForm({ ...adjForm, productId: v, lotNumber: '', expirationDate: '' })}
              placeholder="Buscar producto..." required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value as 'INCREASE' | 'DECREASE' })} className="w-full px-3 py-2 border rounded-lg">
                <option value="INCREASE">Aumento</option>
                <option value="DECREASE">Disminución</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
              <input type="number" min="0.01" step="0.01" value={adjForm.quantity || ''} onChange={(e) => setAdjForm({ ...adjForm, quantity: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" required />
            </div>
          </div>

          {/* Campos de lote — solo para INCREASE en productos con tracksLot */}
          {adjForm.type === 'INCREASE' && (() => {
            const prod = allProducts.find((p: Product) => p.id === adjForm.productId) || products.find((p: Product) => p.id === adjForm.productId);
            if (!prod?.tracksLot) return null;
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-3">
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                  <Boxes size={13} /> Información de lote (opcional)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Número de lote
                    </label>
                    <input
                      value={adjForm.lotNumber}
                      onChange={(e) => setAdjForm({ ...adjForm, lotNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white"
                      placeholder="Escribe el lote existente o deja vacío para crear nuevo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de vencimiento</label>
                    <input
                      type="date"
                      value={adjForm.expirationDate}
                      onChange={(e) => setAdjForm({ ...adjForm, expirationDate: e.target.value })}
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-blue-600">
                  Ingresa el número de lote existente para aumentar su stock, o déjalo vacío para crear un lote nuevo automáticamente.
                </p>
              </div>
            );
          })()}

          <div><label className="block text-sm font-medium text-gray-700 mb-1">Razón</label>
            <textarea value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2} required placeholder="Motivo del ajuste..." />
          </div>
          <button type="submit" disabled={createAdjustment.isPending} className="w-full py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium text-sm">
            {createAdjustment.isPending ? 'Registrando...' : 'Registrar Ajuste'}
          </button>
        </form>
      </Modal>

      {/* ── Modal: Import Excel ── */}
      <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportRows([]); if (importFileRef.current) importFileRef.current.value = ''; }} title="Importar Stock desde Excel" size="lg">
        <div className="space-y-4">
          {/* Template download */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-700">Plantilla Excel</div>
              <div className="text-xs text-gray-500 mt-0.5">Columnas requeridas: <span className="font-mono bg-gray-100 px-1 rounded">Producto</span> y <span className="font-mono bg-gray-100 px-1 rounded">Cantidad</span></div>
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium flex-shrink-0 transition-colors">
              <Download size={14} /> Descargar plantilla
            </button>
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Empresa destino *</label>
            <select value={importCompanyId} onChange={e => setImportCompanyId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required>
              <option value="">Seleccionar empresa...</option>
              {companyList.map((c: Company) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* File drop zone */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Archivo Excel (.xlsx, .xls)</label>
            <label className="flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors group">
              <FileSpreadsheet size={28} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
              <span className="text-sm text-gray-500 group-hover:text-emerald-600 transition-colors font-medium">
                {importRows.length > 0 ? `${importRows.length} filas cargadas — clic para cambiar` : 'Clic para seleccionar archivo'}
              </span>
              <span className="text-xs text-gray-400">.xlsx o .xls</span>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFile} />
            </label>
          </div>

          {/* Preview table */}
          {importRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600">Vista previa</span>
                <div className="flex gap-2 text-[10px] font-semibold">
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">{importRows.filter(r => r.matched).length} encontrados</span>
                  {importRows.filter(r => !r.matched).length > 0 && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200">{importRows.filter(r => !r.matched).length} no encontrados</span>
                  )}
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-xl">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Producto (Excel)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500">Cantidad</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importRows.map((row, idx) => (
                      <tr key={idx} className={row.matched ? 'hover:bg-gray-50' : 'bg-red-50/60'}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-700">{row.excelName}</div>
                          {row.matched && row.matched.name !== row.excelName && (
                            <div className="text-gray-400 text-[10px] mt-0.5">→ {row.matched.name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">{row.quantity}</td>
                        <td className="px-3 py-2 text-center">
                          {row.matched
                            ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-semibold border border-green-200">Encontrado</span>
                            : <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold border border-red-200">No encontrado</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.some(r => !r.matched) && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Los productos "No encontrados" serán omitidos. Verifica que los nombres coincidan exactamente con el catálogo.
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={isImporting || !importCompanyId || importRows.filter(r => r.matched && r.quantity > 0).length === 0}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            <Upload size={16} />
            {isImporting ? 'Importando...' : `Importar ${importRows.filter(r => r.matched && r.quantity > 0).length} productos al stock`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
