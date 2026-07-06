import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useCreatePurchase } from '../hooks/usePurchases';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useProducts, useCreateProduct } from '../../products/hooks/useProducts';
import { usePriceTiers } from '../../price-tiers/hooks/usePriceTiers';
import { useCategories } from '../../categories/hooks/useCategories';
import { useRucLookup, useTipoCambio } from '../../../shared/hooks/useLookup';
import { useSupplierByRuc, useCreateSupplier } from '../../suppliers/hooks/useSuppliers';
import { useCashRegisterToday } from '../../cash-register/hooks/useCashRegister';
import { Modal } from '../../../shared/components/Modal';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import {
  ArrowLeft, ShoppingCart, Trash2, Search, Loader2, DollarSign, PackagePlus,
  FileText, CopyIcon, Dices, Wand2, Building2, Users, CreditCard, Package, Gift,
} from 'lucide-react';
import type { Company, Product, Category } from '../../../shared/types';
import toast from 'react-hot-toast';

const IGV_RATE = 0.18;

interface PurchaseFormItem {
  productId: string;
  quantity: number;
  lotNumber?: string;
  expirationDate?: string;
  taxType?: string;
  unitPriceSinIgv: number;
  unitPriceConIgv: number;
  flete: number;
  otrosCostos: number;
  costoAdquisicion: number;
  markupPercent: number;
  precioVenta: number;
  markupMinoristaPercent: number;
  precioMinorista: number;
  markupEspecialPercent: number;
  precioEspecial: number;
  minMarginPercent: number;
  precioVentaMode: 'markup' | 'direct';
  precioMinoristaMode: 'markup' | 'direct';
  precioEspecialMode: 'markup' | 'direct';
}

const emptyItem = (): PurchaseFormItem => ({
  productId: '', quantity: 0, lotNumber: '', expirationDate: '',
  taxType: 'GRAVADO', unitPriceSinIgv: 0, unitPriceConIgv: 0, flete: 0, otrosCostos: 0,
  costoAdquisicion: 0, markupPercent: 20, precioVenta: 0,
  markupMinoristaPercent: 15, precioMinorista: 0,
  markupEspecialPercent: 10, precioEspecial: 0,
  minMarginPercent: 5,
  precioVentaMode: 'markup', precioMinoristaMode: 'markup', precioEspecialMode: 'markup',
});

function recalcItem(item: PurchaseFormItem, tc: number, isUsd: boolean): PurchaseFormItem {
  const isExempt = item.taxType === 'INAFECTO' || item.taxType === 'EXONERADO';
  const unitPriceConIgv = isExempt
    ? item.unitPriceSinIgv
    : Math.round(item.unitPriceSinIgv * (1 + IGV_RATE) * 100) / 100;
  // Si la factura es en USD, convertir a soles con tipo de cambio; si es PEN, ya está en soles
  const unitConIgvPen = isUsd
    ? Math.round(unitPriceConIgv * tc * 100) / 100
    : unitPriceConIgv;
  const costoAdquisicion = Math.round((unitConIgvPen + item.flete + item.otrosCostos) * 100) / 100;

  // P. Venta
  let precioVenta = item.precioVenta;
  let markupPercent = item.markupPercent;
  if (item.precioVentaMode === 'markup') {
    precioVenta = costoAdquisicion > 0 ? Math.round(costoAdquisicion * (1 + markupPercent / 100) * 100) / 100 : 0;
  } else {
    markupPercent = costoAdquisicion > 0 ? Math.round(((precioVenta / costoAdquisicion) - 1) * 10000) / 100 : 0;
  }

  // P. Rebaja
  let precioMinorista = item.precioMinorista;
  let markupMinoristaPercent = item.markupMinoristaPercent;
  if (item.precioMinoristaMode === 'markup') {
    precioMinorista = costoAdquisicion > 0 ? Math.round(costoAdquisicion * (1 + markupMinoristaPercent / 100) * 100) / 100 : 0;
  } else {
    markupMinoristaPercent = costoAdquisicion > 0 ? Math.round(((precioMinorista / costoAdquisicion) - 1) * 10000) / 100 : 0;
  }

  // P. Especial
  let precioEspecial = item.precioEspecial;
  let markupEspecialPercent = item.markupEspecialPercent;
  if (item.precioEspecialMode === 'markup') {
    precioEspecial = costoAdquisicion > 0 ? Math.round(costoAdquisicion * (1 + markupEspecialPercent / 100) * 100) / 100 : 0;
  } else {
    markupEspecialPercent = costoAdquisicion > 0 ? Math.round(((precioEspecial / costoAdquisicion) - 1) * 10000) / 100 : 0;
  }

  return { ...item, unitPriceConIgv, costoAdquisicion, precioVenta, markupPercent, precioMinorista, markupMinoristaPercent, precioEspecial, markupEspecialPercent };
}

function SectionCard({ title, icon: Icon, children, className = '', iconClassName = 'text-primary-600' }: { title: string; icon: any; children: React.ReactNode; className?: string; iconClassName?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon size={16} className={iconClassName} />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function NewPurchasePage() {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const isHistorical = searchParams.get('historical') === 'true';

  const { data: companies } = useCompanies();
  const { data: productsData } = useProducts({ limit: 9999 });
  const createPurchase = useCreatePurchase();
  const rucLookup = useRucLookup();
  const supplierByRuc = useSupplierByRuc();
  const createSupplier = useCreateSupplier();
  const tipoCambioMutation = useTipoCambio();
  const { data: cashRegisterToday } = useCashRegisterToday();
  const { data: priceTiersData } = usePriceTiers();
  const { data: categoriesData } = useCategories();
  const createProduct = useCreateProduct();
  const categories: Category[] = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.data || [];
  const sortedTiers = (Array.isArray(priceTiersData) ? priceTiersData : [])
    .filter((t: any) => t.isActive)
    .sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0));
  const tierLabel = (idx: number) => sortedTiers[idx]?.name ? `P. ${sortedTiers[idx].name}` : ['P. Mayorista', 'P. Minorista', 'P. Especial'][idx];

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const [currency, setCurrency] = useState<'PEN' | 'USD'>('PEN');
  const [form, setForm] = useState({
    companyId: '', supplier: '', supplierRuc: '', supplierId: '',
    paymentType: 'CONTADO' as 'CONTADO' | 'CREDITO' | 'PENDIENTE_ACUERDO',
    paymentScheduleType: 'SINGLE_DATE' as 'SINGLE_DATE' | 'INSTALLMENTS', dueDate: '',
    installments: [] as { amount: number; dueDate: string }[],
    items: [emptyItem()] as PurchaseFormItem[],
    purchaseDate: today,
    totalCostUsd: 0,
    totalCostPen: 0,
    documentType: 'FACTURA' as 'FACTURA' | 'BOLETA' | 'GUIA' | 'NOTA_CREDITO' | 'OTRO',
    documentSeries: '',
    documentNumber: '',
    issueDate: today,
  });
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [exchangeRateDate, setExchangeRateDate] = useState('');
  const [supplierLocked, setSupplierLocked] = useState(false);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [installmentGen, setInstallmentGen] = useState({ count: 6 });
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductForIdx, setNewProductForIdx] = useState<number>(-1);
  const [newProduct, setNewProduct] = useState({ name: '', categoryId: '', unit: 'unidad' });
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  interface BonifItem { productId: string; quantity: number; lotNumber: string; expirationDate: string; }
  const [bonificationItems, setBonificationItems] = useState<BonifItem[]>([]);
  const addBonifItem = () => setBonificationItems(prev => [...prev, { productId: '', quantity: 0, lotNumber: '', expirationDate: '' }]);
  const removeBonifItem = (idx: number) => setBonificationItems(prev => prev.filter((_, i) => i !== idx));
  const updateBonifItem = (idx: number, field: string, value: any) => setBonificationItems(prev => {
    const items = [...prev];
    items[idx] = { ...items[idx], [field]: value };
    return items;
  });

  // Obtener tipo de cambio al cargar la página con la fecha de hoy
  useEffect(() => {
    tipoCambioMutation.mutate(today, {
      onSuccess: (data) => { setExchangeRate(data.venta); setExchangeRateDate(data.fecha); },
      onError: () => {},
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const companyList = Array.isArray(companies) ? companies : [];
  const products = productsData?.data || [];

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }));
  const repeatFromPrev = (idx: number, field: 'lotNumber' | 'expirationDate') => {
    if (idx === 0) return;
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: (items[idx - 1] as any)[field] || '' };
      return { ...prev, items };
    });
  };
  const autoGenLot = (idx: number) => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], lotNumber: `L-${stamp}-${String(idx + 1).padStart(2, '0')}` };
      return { ...prev, items };
    });
  };
  const removeItem = (idx: number) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx: number, field: string, value: any) => setForm(prev => {
    const items = [...prev.items];
    let item = { ...items[idx], [field]: value };
    if (field === 'markupPercent') item.precioVentaMode = 'markup';
    if (field === 'precioVenta') item.precioVentaMode = 'direct';
    if (field === 'markupMinoristaPercent') item.precioMinoristaMode = 'markup';
    if (field === 'precioMinorista') item.precioMinoristaMode = 'direct';
    if (field === 'markupEspecialPercent') item.precioEspecialMode = 'markup';
    if (field === 'precioEspecial') item.precioEspecialMode = 'direct';
    if (field === 'productId') {
      const p = products.find((pr: Product) => pr.id === value);
      item = { ...item, taxType: p?.taxType || 'GRAVADO' };
    }
    const costoFields = ['unitPriceSinIgv', 'flete', 'otrosCostos', 'markupPercent', 'precioVenta', 'markupMinoristaPercent', 'precioMinorista', 'markupEspecialPercent', 'precioEspecial', 'productId'];
    if (costoFields.includes(field)) item = recalcItem(item, exchangeRate ?? 1, currency === 'USD');
    items[idx] = item;
    return { ...prev, items };
  });

  const fetchTC = (date: string, onDone?: (tc: number) => void) => {
    tipoCambioMutation.mutate(date, {
      onSuccess: (data) => {
        setExchangeRate(data.venta);
        setExchangeRateDate(data.fecha);
        setForm(prev => ({ ...prev, items: prev.items.map(i => recalcItem(i, data.venta, currency === 'USD')) }));
        onDone?.(data.venta);
      },
      onError: () => { setExchangeRate(null); setExchangeRateDate(''); toast.error('No se pudo obtener el tipo de cambio'); },
    });
  };

  const handleDateChange = (date: string) => {
    setForm(prev => ({ ...prev, purchaseDate: date }));
    if (date) fetchTC(date);
  };

  const handleCurrencyChange = (cur: 'PEN' | 'USD') => {
    setCurrency(cur);
    // Resetear precios del ítem al cambiar moneda para evitar valores incorrectos
    setForm(prev => ({
      ...prev,
      items: prev.items.map(i => recalcItem(
        { ...i, unitPriceSinIgv: 0, unitPriceConIgv: 0 },
        exchangeRate ?? 1,
        cur === 'USD',
      )),
    }));
    if (form.purchaseDate && !exchangeRate) fetchTC(form.purchaseDate);
  };

  const totalSoles = currency === 'USD' && exchangeRate && form.totalCostUsd ? Math.round(form.totalCostUsd * exchangeRate * 100) / 100 : 0;
  const creditTotal = currency === 'USD' ? totalSoles : form.totalCostPen;

  const itemsSubtotal = form.items.reduce((s, i) => s + (i.quantity * i.costoAdquisicion || 0), 0);

  const generateInstallments = () => {
    const { count } = installmentGen;
    if (count < 1) { toast.error('Ingresa al menos 1 cuota'); return; }
    const baseAmount = currency === 'USD' ? form.totalCostUsd : creditTotal;
    if (!baseAmount || baseAmount <= 0) { toast.error('Primero ingresa el monto total de la compra'); return; }
    if (!form.issueDate) { toast.error('Ingresa la fecha de emisión primero'); return; }

    const base = Math.round((baseAmount / count) * 100) / 100;
    const installments: { amount: number; dueDate: string }[] = [];
    let accumulated = 0;
    const baseDate = new Date(form.issueDate + 'T00:00:00');

    for (let i = 0; i < count; i++) {
      const daysOffset = (i + 1) * 30;
      const due = new Date(baseDate);
      due.setDate(due.getDate() + daysOffset);
      const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;

      const isLast = i === count - 1;
      const amount = isLast ? Math.round((baseAmount - accumulated) * 100) / 100 : base;
      accumulated = Math.round((accumulated + amount) * 100) / 100;

      installments.push({ amount, dueDate: dueStr });
    }
    setForm((prev) => ({ ...prev, installments }));
    toast.success(`${count} cuota${count > 1 ? 's' : ''} generada${count > 1 ? 's' : ''}`);
  };

  const getDiasPlazo = (dueDate: string, _idx: number): number => {
    if (!dueDate) return 0;
    const prevDate = form.issueDate;
    if (!prevDate) return 0;
    const base = new Date(prevDate + 'T00:00:00');
    const due = new Date(dueDate + 'T00:00:00');
    return Math.round((due.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  };

  const updateDiasPlazo = (idx: number, days: number) => {
    if (!isHistorical && days < 1) return;
    const prevDate = form.issueDate;
    if (!prevDate) return;
    const base = new Date(prevDate + 'T00:00:00');
    base.setDate(base.getDate() + days);
    const dueStr = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    const installments = [...form.installments];
    installments[idx] = { ...installments[idx], dueDate: dueStr };
    setForm(prev => ({ ...prev, installments }));
  };

  const openQuickProduct = (idx: number) => {
    setNewProductForIdx(idx);
    setNewProduct({ name: '', categoryId: '', unit: 'unidad' });
    setShowNewProduct(true);
  };

  const handleCreateQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createProduct.mutateAsync({ name: newProduct.name, categoryId: newProduct.categoryId, unit: newProduct.unit, prices: [] });
      if (created && newProductForIdx >= 0) {
        updateItem(newProductForIdx, 'productId', created.id);
      }
      setShowNewProduct(false);
    } catch { /* error handled by hook */ }
  };

  const handleSupplierLookup = async () => {
    const ruc = form.supplierRuc.trim();
    if (ruc.length !== 11) { toast.error('El RUC debe tener 11 dígitos'); return; }

    setSupplierLoading(true);
    try {
      const localSupplier = await supplierByRuc.mutateAsync(ruc);
      if (localSupplier) {
        setForm(prev => ({ ...prev, supplier: localSupplier.businessName, supplierId: localSupplier.id }));
        setSupplierLocked(true);
        toast.success('Proveedor encontrado en el sistema');
        setSupplierLoading(false);
        return;
      }
    } catch { /* not found locally */ }

    try {
      const result = await rucLookup.mutateAsync(ruc);
      if (result.razonSocial) {
        const newSupplier = await createSupplier.mutateAsync({
          ruc,
          businessName: result.razonSocial,
          address: result.direccion || '',
        });
        setForm(prev => ({ ...prev, supplier: result.razonSocial, supplierId: newSupplier?.id || '' }));
        setSupplierLocked(true);
        toast.success('Proveedor encontrado en SUNAT y registrado');
      }
    } catch { /* toast handled by hook */ } finally {
      setSupplierLoading(false);
    }
  };

  const clearSupplier = () => {
    setForm(prev => ({ ...prev, supplier: '', supplierId: '', supplierRuc: '' }));
    setSupplierLocked(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.paymentType === 'CONTADO' && (cashRegisterToday as any)?.status === 'CLOSED') {
      toast.error('La caja del día está cerrada. No se pueden registrar compras al contado.');
      return;
    }
    if (currency === 'USD' && (!exchangeRate || !form.totalCostUsd)) { toast.error('Ingrese el monto en USD y verifique el tipo de cambio'); return; }
    if (currency === 'PEN' && !form.totalCostPen) { toast.error('Ingrese el monto en soles'); return; }
    const missingLot = form.items.find(i => {
      const p = products.find((pr: Product) => pr.id === i.productId);
      return p?.tracksLot && !i.lotNumber;
    });
    if (missingLot) { toast.error('Hay productos que requieren número de lote'); return; }
    const missingBonifLot = bonificationItems.find(i => {
      if (!i.productId || i.quantity <= 0) return false;
      const p = products.find((pr: Product) => pr.id === i.productId);
      return p?.tracksLot && !i.lotNumber;
    });
    if (missingBonifLot) { toast.error('Hay bonificaciones que requieren número de lote'); return; }
    const belowCost = form.items.find(i => {
      if (i.costoAdquisicion <= 0) return false;
      const floor = Math.round(i.costoAdquisicion * (1 + i.minMarginPercent / 100) * 100) / 100;
      return (i.precioVenta > 0 && i.precioVenta < floor) ||
             (i.precioMinorista > 0 && i.precioMinorista < floor) ||
             (i.precioEspecial > 0 && i.precioEspecial < floor);
    });
    if (belowCost) {
      const prod = products.find((p: Product) => p.id === belowCost.productId);
      const floor = Math.round(belowCost.costoAdquisicion * (1 + belowCost.minMarginPercent / 100) * 100) / 100;
      toast.error(`"${prod?.name || 'Producto'}" — los precios de venta no pueden ser menores al precio piso (S/ ${floor.toFixed(2)})`);
      return;
    }
    const payload: any = {
      companyId: form.companyId, supplier: form.supplier,
      items: form.items.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitCost: i.costoAdquisicion,
        unitPriceSinIgv: i.unitPriceSinIgv,
        unitPriceConIgv: i.unitPriceConIgv,
        flete: i.flete || undefined,
        otrosCostos: i.otrosCostos || undefined,
        precioVenta: i.precioVenta || undefined,
        precioMinorista: i.precioMinorista || undefined,
        precioEspecial: i.precioEspecial || undefined,
        markupPercent: i.markupPercent || undefined,
        markupMinoristaPercent: i.markupMinoristaPercent,
        markupEspecialPercent: i.markupEspecialPercent,
        minMarginPercent: i.minMarginPercent,
        ...(i.lotNumber ? { lotNumber: i.lotNumber } : {}),
        ...(i.expirationDate ? { expirationDate: i.expirationDate } : {}),
        ...(i.taxType ? { taxType: i.taxType } : {}),
      })),
      paymentType: form.paymentType,
      date: form.purchaseDate,
      ...(isHistorical ? { isHistorical: true } : {}),
    };
    if (form.documentType) payload.documentType = form.documentType;
    payload.documentSeries = form.documentSeries;
    payload.documentNumber = form.documentNumber;
    if (form.issueDate) payload.issueDate = form.issueDate;
    if (currency === 'USD') {
      payload.totalCostUsd = form.totalCostUsd;
      payload.exchangeRate = exchangeRate;
      payload.exchangeRateDate = exchangeRateDate;
    } else {
      payload.totalCost = form.totalCostPen;
    }
    if (form.supplierId) payload.supplierId = form.supplierId;
    if (form.supplierRuc) payload.supplierRuc = form.supplierRuc;
    const validBonifItems = bonificationItems.filter(i => i.productId && i.quantity > 0);
    if (validBonifItems.length > 0) {
      payload.bonificationItems = validBonifItems.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        ...(i.lotNumber ? { lotNumber: i.lotNumber } : {}),
        ...(i.expirationDate ? { expirationDate: i.expirationDate } : {}),
      }));
    }
    if (form.paymentType === 'CREDITO') {
      payload.paymentScheduleType = form.paymentScheduleType;
      if (form.paymentScheduleType === 'SINGLE_DATE') payload.dueDate = form.dueDate;
      if (form.paymentScheduleType === 'INSTALLMENTS') payload.installments = form.installments;
    }
    setPendingPayload(payload);
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingPayload) return;
    setShowConfirm(false);
    await createPurchase.mutateAsync(pendingPayload);
    navigate('/purchases');
  };

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/purchases" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Volver">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <ShoppingCart size={12} /> Compras
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isHistorical ? 'Registrar Factura Histórica' : 'Nueva Compra'}
          </h1>
        </div>
      </div>

      {isHistorical && (
        <div className="mb-4 flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <FileText size={18} className="text-indigo-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-indigo-800">Factura histórica — no modifica stock</div>
            <div className="text-xs text-indigo-600 mt-0.5">Los productos ingresados solo actualizarán precios. Las cuotas o pagos con fecha vencida quedarán marcados automáticamente como pagados.</div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Empresa y proveedor */}
          <SectionCard title="Empresa y proveedor" icon={Building2}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
                <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400" required>
                  <option value="">Seleccionar...</option>
                  {companyList.map((c: Company) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Users size={12} /> Proveedor
                </label>
                <div className="flex gap-2">
                  <input
                    value={form.supplierRuc}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); setForm({ ...form, supplierRuc: v }); if (supplierLocked) clearSupplier(); }}
                    className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    placeholder="RUC (11 dígitos)"
                    maxLength={11}
                  />
                  <button
                    type="button"
                    onClick={handleSupplierLookup}
                    disabled={form.supplierRuc.length !== 11 || supplierLoading}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
                  >
                    {supplierLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Buscar
                  </button>
                  <input
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    className={`flex-1 px-3 py-2 border rounded-lg text-sm ${supplierLocked ? 'bg-primary-50 border-primary-300' : 'border-gray-200'}`}
                    placeholder="Nombre del proveedor"
                    readOnly={supplierLocked}
                    required
                  />
                </div>
                {supplierLocked && (
                  <button type="button" onClick={clearSupplier} className="mt-1 text-xs text-gray-500 hover:text-red-500">
                    Limpiar proveedor y buscar otro
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Comprobante */}
          <SectionCard title="Comprobante de pago" icon={FileText}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value as any })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="FACTURA">Factura</option>
                  <option value="BOLETA">Boleta</option>
                  <option value="GUIA">Guía</option>
                  <option value="NOTA_CREDITO">Nota Crédito</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serie <span className="text-red-500">*</span></label>
                <input value={form.documentSeries} onChange={(e) => setForm({ ...form, documentSeries: e.target.value.toUpperCase() })} placeholder="F001" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm uppercase" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Número <span className="text-red-500">*</span></label>
                <input
                  value={form.documentNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setForm({ ...form, documentNumber: val });
                  }}
                  placeholder="00012345"
                  maxLength={8}
                  inputMode="numeric"
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">F. Emisión</label>
                <input type="date" value={form.issueDate} max={today} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">F. Recepción</label>
                <input type="date" value={form.purchaseDate} max={today} onChange={(e) => handleDateChange(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Condiciones de pago — va ANTES del total para que la moneda esté definida primero */}
        <SectionCard title="Condiciones de pago" icon={CreditCard}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleCurrencyChange('PEN')} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition ${currency === 'PEN' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>S/ Soles</button>
                <button type="button" onClick={() => handleCurrencyChange('USD')} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition ${currency === 'USD' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>$ Dólares</button>
              </div>
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-blue-700 flex-shrink-0">T.C. USD/PEN (venta)</span>
                <div className="flex items-center gap-2">
                  {tipoCambioMutation.isPending && <Loader2 size={14} className="animate-spin text-blue-500" />}
                  {!tipoCambioMutation.isPending && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-blue-600 font-medium">S/</span>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={exchangeRate ?? ''}
                        onChange={e => {
                          const val = Math.max(0, parseFloat(e.target.value) || 0);
                          setExchangeRate(val || null);
                          if (val > 0) {
                            setForm(prev => ({
                              ...prev,
                              items: prev.items.map(i => recalcItem(i, val, currency === 'USD')),
                            }));
                          }
                        }}
                        placeholder="0.0000"
                        className="w-24 px-2 py-1 border border-blue-200 bg-white rounded text-sm font-semibold text-blue-800 text-right focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Pago</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, paymentType: 'CONTADO', paymentScheduleType: 'SINGLE_DATE', dueDate: '', installments: [] })} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition ${form.paymentType === 'CONTADO' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>Contado</button>
                <button type="button" onClick={() => setForm({ ...form, paymentType: 'CREDITO' })} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition ${form.paymentType === 'CREDITO' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>Crédito</button>
                <button type="button" onClick={() => setForm({ ...form, paymentType: 'PENDIENTE_ACUERDO', paymentScheduleType: 'SINGLE_DATE', dueDate: '', installments: [] })} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition ${form.paymentType === 'PENDIENTE_ACUERDO' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>Acuerdo</button>
              </div>
            </div>
          </div>

          {form.paymentType === 'PENDIENTE_ACUERDO' && (
            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-start gap-2">
              <span className="text-purple-500 mt-0.5 text-base leading-none">⚡</span>
              <div>
                <p className="text-xs font-semibold text-purple-800">Pendiente de acuerdo de pago</p>
                <p className="text-xs text-purple-600 mt-0.5">Esta factura quedará sin fecha de vencimiento. Puedes consolidarla en un Acuerdo de Pago desde la página de Cuentas por Pagar.</p>
              </div>
            </div>
          )}

          {form.paymentType === 'CREDITO' && (
            <div className="mt-4 space-y-3 bg-orange-50 p-3 rounded-lg border border-orange-200">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Modalidad</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({ ...form, paymentScheduleType: 'SINGLE_DATE', installments: [] })} className={`flex-1 py-1.5 rounded text-xs font-medium border ${form.paymentScheduleType === 'SINGLE_DATE' ? 'border-orange-400 bg-white text-orange-700' : 'border-gray-200 text-gray-500'}`}>Fecha única</button>
                  <button type="button" onClick={() => setForm({ ...form, paymentScheduleType: 'INSTALLMENTS', dueDate: '' })} className={`flex-1 py-1.5 rounded text-xs font-medium border ${form.paymentScheduleType === 'INSTALLMENTS' ? 'border-orange-400 bg-white text-orange-700' : 'border-gray-200 text-gray-500'}`}>Cuotas</button>
                </div>
              </div>
              {form.paymentScheduleType === 'SINGLE_DATE' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha de vencimiento</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
                </div>
              )}
              {form.paymentScheduleType === 'INSTALLMENTS' && (
                <p className="text-xs text-orange-600 font-medium">Configura las cuotas en la sección de abajo, después de ingresar el monto total.</p>
              )}
            </div>
          )}
        </SectionCard>

        {/* Total de la compra — va DESPUÉS de las condiciones para que la moneda ya esté seleccionada */}
        <SectionCard title="Total de la compra" icon={DollarSign}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currency === 'PEN' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto Total (Soles)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">S/</span>
                  <input type="number" min="0.01" step="0.01" value={form.totalCostPen || ''} onChange={(e) => setForm({ ...form, totalCostPen: parseFloat(e.target.value) || 0 })} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" placeholder="0.00" required />
                </div>
              </div>
            )}
            {currency === 'USD' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto Total (USD)</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="number" min="0.01" step="0.01" value={form.totalCostUsd || ''} onChange={(e) => setForm({ ...form, totalCostUsd: parseFloat(e.target.value) || 0 })} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" placeholder="0.00" required />
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Subtotal por items (en S/)</span>
                <span>S/ {itemsSubtotal.toFixed(2)}</span>
              </div>
              {currency === 'USD' && exchangeRate != null && form.totalCostUsd > 0 && (
                <div className="flex items-center justify-between text-xs text-blue-600">
                  <span>Total en Soles (×{exchangeRate.toFixed(4)})</span>
                  <span className="font-semibold">S/ {totalSoles.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-700">Total</span>
                <span className="text-xl font-bold text-primary-700">
                  {currency === 'USD' ? `$ ${(form.totalCostUsd || 0).toFixed(2)}` : `S/ ${(form.totalCostPen || 0).toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Cuotas — solo si crédito + cuotas, después del total */}
        {form.paymentType === 'CREDITO' && form.paymentScheduleType === 'INSTALLMENTS' && (
          <SectionCard title="Cuotas" icon={CreditCard}>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-1 text-xs font-semibold text-orange-700 mb-2">
                <Wand2 size={13} /> Generar cuotas automáticamente
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-500 shrink-0"># de cuotas</label>
                  <input type="number" min="1" max="36" step="1" value={installmentGen.count || ''} onChange={(e) => setInstallmentGen({ count: parseInt(e.target.value) || 0 })} className="w-20 px-2 py-1.5 border rounded text-sm" />
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] flex-1">
                  {[3, 4, 5, 6, 8, 12].map(n => (
                    <button key={n} type="button" onClick={() => setInstallmentGen({ count: n })} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200">{n}</button>
                  ))}
                </div>
                <button type="button" onClick={generateInstallments} className="px-3 py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700 inline-flex items-center gap-1 shrink-0">
                  <Wand2 size={12} /> Generar
                </button>
              </div>
            </div>

            {form.installments.length > 0 && (
              <>
                <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 px-1 mb-1">
                  <div />
                  <div className="text-[10px] font-medium text-gray-500">Monto ({currency === 'USD' ? '$' : 'S/'})</div>
                  <div className="text-[10px] font-medium text-gray-500">Días de plazo</div>
                  <div className="text-[10px] font-medium text-gray-500">Fecha de vencimiento</div>
                  <div />
                </div>
                {form.installments.map((inst, idx) => {
                  const dias = getDiasPlazo(inst.dueDate, idx);
                  return (
                    <div key={idx} className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 mb-2 items-center">
                      <span className="text-xs text-gray-400 font-medium text-right">#{idx + 1}</span>
                      <input type="number" min="0.01" step="0.01" value={inst.amount || ''}
                        onChange={(e) => { const ins = [...form.installments]; ins[idx] = { ...ins[idx], amount: parseFloat(e.target.value) || 0 }; setForm({ ...form, installments: ins }); }}
                        className="w-full px-2 py-1.5 border rounded text-sm" required />
                      <input type="number" min={isHistorical ? undefined : 1} step="1" value={dias || ''}
                        onChange={(e) => updateDiasPlazo(idx, parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border rounded text-sm" />
                      <input type="date" value={inst.dueDate}
                        onChange={(e) => { const ins = [...form.installments]; ins[idx] = { ...ins[idx], dueDate: e.target.value }; setForm({ ...form, installments: ins }); }}
                        className="w-full px-2 py-1.5 border rounded text-sm" required />
                      <button type="button" onClick={() => setForm({ ...form, installments: form.installments.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-500">
                    {(() => {
                      const instSym = currency === 'USD' ? '$' : 'S/';
                      const instBase = currency === 'USD' ? form.totalCostUsd : creditTotal;
                      const instTotal = form.installments.reduce((s, i) => s + (i.amount || 0), 0);
                      return (
                        <>
                          Total: <span className="font-semibold">{instSym} {instTotal.toFixed(2)}</span>
                          {instBase > 0 && Math.abs(instTotal - instBase) > 0.01 && (
                            <span className="text-red-600 ml-1">· no coincide con {instBase.toFixed(2)}</span>
                          )}
                        </>
                      );
                    })()}
                  </span>
                  <button type="button" onClick={() => setForm({ ...form, installments: [...form.installments, { amount: 0, dueDate: '' }] })} className="text-xs text-orange-600 hover:text-orange-800 font-medium">+ Agregar cuota</button>
                </div>
              </>
            )}
            {form.installments.length === 0 && (
              <p className="text-xs text-gray-400">Usa el generador de arriba o agrega cuotas manualmente.</p>
            )}
          </SectionCard>
        )}

        {/* Productos */}
        <SectionCard title={`Productos (${form.items.length})`} icon={Package}>
          <div className="flex items-center justify-end mb-3">
            <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:text-primary-800 font-medium">+ Agregar producto</button>
          </div>
          <div className="space-y-4">
            {form.items.map((item, idx) => {
              const product = products.find((p: Product) => p.id === item.productId);
              const needsLot = product?.tracksLot;
              return (
                <div key={idx} className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
                  {/* Header del ítem */}
                  <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-700">
                        {product ? product.name : <span className="text-gray-400 font-normal">Producto sin seleccionar</span>}
                      </span>
                    </div>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="p-4">
                  <div className="grid grid-cols-12 gap-2 items-end mb-2">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-xs text-gray-500 mb-1">Producto</label>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <SearchableSelect
                            options={products.map((p: Product) => ({ value: p.id, label: p.name }))}
                            value={item.productId}
                            onChange={(v) => updateItem(idx, 'productId', v)}
                            placeholder="Buscar producto..."
                            minChars={1}
                            required
                          />
                        </div>
                        <button type="button" onClick={() => openQuickProduct(idx)} className="px-2 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 shrink-0" title="Crear nuevo producto">
                          <PackagePlus size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                      <input type="number" min="0.01" step="0.01" value={item.quantity || ''} onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border rounded text-sm" required />
                    </div>
                    <div className="col-span-8 sm:col-span-3">
                      <label className="block text-xs text-gray-500 mb-1 flex items-center justify-between">
                        <span>Lote {needsLot && <span className="text-red-500">*</span>}</span>
                        <span className="flex gap-1">
                          {idx > 0 && <button type="button" onClick={() => repeatFromPrev(idx, 'lotNumber')} className="text-gray-400 hover:text-primary-600" title="Copiar del anterior"><CopyIcon size={11} /></button>}
                          <button type="button" onClick={() => autoGenLot(idx)} className="text-gray-400 hover:text-primary-600" title="Generar lote"><Dices size={11} /></button>
                        </span>
                      </label>
                      <input value={item.lotNumber || ''} onChange={(e) => updateItem(idx, 'lotNumber', e.target.value)} placeholder={needsLot ? 'L-20260415-01' : 'Opcional'} className={`w-full px-2 py-1.5 border rounded text-sm ${needsLot && !item.lotNumber ? 'border-red-300 bg-red-50' : product && !needsLot ? 'bg-gray-100 text-gray-500' : ''}`} />
                    </div>
                    <div className="col-span-12 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 flex items-center justify-between">
                        <span>Vence</span>
                        {idx > 0 && <button type="button" onClick={() => repeatFromPrev(idx, 'expirationDate')} className="text-gray-400 hover:text-primary-600" title="Copiar del anterior"><CopyIcon size={11} /></button>}
                      </label>
                      <input type="date" value={item.expirationDate || ''} onChange={(e) => updateItem(idx, 'expirationDate', e.target.value)} className={`w-full px-2 py-1.5 border rounded text-sm ${product && !needsLot ? 'bg-gray-100 text-gray-500' : ''}`} />
                    </div>
                  </div>
                  {/* === Costos del ítem === */}
                  {(() => {
                    const isExempt = item.taxType === 'INAFECTO' || item.taxType === 'EXONERADO';
                    const utilidad = item.precioVenta > 0
                      ? Math.round((item.precioVenta * 0.985 - item.costoAdquisicion) * 100) / 100
                      : 0;
                    const utilidadMinorista = item.precioMinorista > 0
                      ? Math.round((item.precioMinorista * 0.985 - item.costoAdquisicion) * 100) / 100
                      : 0;
                    const utilidadEspecial = item.precioEspecial > 0
                      ? Math.round((item.precioEspecial * 0.985 - item.costoAdquisicion) * 100) / 100
                      : 0;
                    const isUtilidadPos = utilidad >= 0;
                    return (
                      <div className="mt-3 space-y-3">
                        {/* Bloque precios en factura */}
                        <div className={`border rounded-xl p-4 ${currency === 'USD' ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <span className={`text-xs font-semibold flex items-center gap-1.5 ${currency === 'USD' ? 'text-blue-700' : 'text-gray-700'}`}>
                              {currency === 'USD' ? <DollarSign size={13} /> : null}
                              {currency === 'USD' ? 'Precio en factura (USD)' : 'Precio en factura (S/)'}
                            </span>
                            {currency === 'USD' && (
                              <span className="text-xs font-medium text-blue-600 bg-white border border-blue-200 px-2.5 py-0.5 rounded-full">
                                {exchangeRate ? `T.C. S/ ${exchangeRate.toFixed(4)}` : (tipoCambioMutation.isPending ? 'Cargando T.C...' : 'T.C. no disponible')}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">P.U. sin IGV</label>
                              <div className="relative">
                                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${currency === 'USD' ? 'text-blue-600' : 'text-gray-500'}`}>
                                  {currency === 'USD' ? '$' : 'S/'}
                                </span>
                                <input type="number" min="0" step="0.01" value={item.unitPriceSinIgv || ''} onChange={(e) => updateItem(idx, 'unitPriceSinIgv', parseFloat(e.target.value) || 0)} className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 ${currency === 'USD' ? 'border-blue-200 focus:ring-blue-100 focus:border-blue-400' : 'border-gray-200 focus:ring-gray-100 focus:border-gray-400'}`} placeholder="0.00" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                {isExempt
                                  ? <span className="text-amber-600">{item.taxType === 'INAFECTO' ? 'Inafecto (sin IGV)' : 'Exonerado (sin IGV)'}</span>
                                  : 'P.U. con IGV (18%)'}
                              </label>
                              <div className="relative">
                                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${currency === 'USD' ? 'text-blue-600' : 'text-gray-500'}`}>
                                  {currency === 'USD' ? '$' : 'S/'}
                                </span>
                                <input type="text" readOnly value={item.unitPriceConIgv ? item.unitPriceConIgv.toFixed(2) : '0.00'} className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm font-semibold ${isExempt ? 'border-amber-200 bg-amber-50 text-amber-800' : currency === 'USD' ? 'border-blue-200 bg-blue-100 text-blue-800' : 'border-gray-200 bg-gray-100 text-gray-800'}`} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bloque costos en soles + C. Adquisición */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Flete</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">S/</span>
                              <input type="number" min="0" step="0.01" value={item.flete || ''} onChange={(e) => updateItem(idx, 'flete', parseFloat(e.target.value) || 0)} className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Otros costos</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">S/</span>
                              <input type="number" min="0" step="0.01" value={item.otrosCostos || ''} onChange={(e) => updateItem(idx, 'otrosCostos', parseFloat(e.target.value) || 0)} className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-green-700 mb-1.5">Costo Adquisición</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 text-xs font-bold">S/</span>
                              <input type="text" readOnly value={item.costoAdquisicion ? item.costoAdquisicion.toFixed(2) : '0.00'} className="w-full pl-9 pr-3 py-2 border border-green-300 rounded-lg text-sm bg-green-50 text-green-800 font-bold" />
                            </div>
                          </div>
                        </div>

                        {/* Fórmula de conversión (solo aplica en USD) */}
                        {currency === 'USD' && exchangeRate != null && item.unitPriceConIgv > 0 && (
                          <div className="text-xs text-blue-500 bg-blue-50 px-3 py-2 rounded-lg">
                            $ {item.unitPriceConIgv.toFixed(2)} × {exchangeRate.toFixed(4)} = S/ {(item.unitPriceConIgv * exchangeRate).toFixed(2)}
                            {(item.flete + item.otrosCostos) > 0 && <> + S/ {(item.flete + item.otrosCostos).toFixed(2)} (flete/otros)</>}
                            {' '}→ <span className="font-semibold text-green-700">S/ {item.costoAdquisicion.toFixed(2)}</span>
                          </div>
                        )}

                        {/* Precios de venta */}
                        {(() => {
                          const floorPrice = item.costoAdquisicion > 0 ? Math.round(item.costoAdquisicion * (1 + item.minMarginPercent / 100) * 100) / 100 : 0;
                          const bfVenta = floorPrice > 0 && item.precioVenta > 0 && item.precioVenta < floorPrice;
                          const bfMinorista = floorPrice > 0 && item.precioMinorista > 0 && item.precioMinorista < floorPrice;
                          const bfEspecial = floorPrice > 0 && item.precioEspecial > 0 && item.precioEspecial < floorPrice;
                          return (
                        <div className="border border-gray-100 rounded-xl p-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="text-xs font-semibold text-gray-500">Precios de venta (S/)</span>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-gray-500">
                                Margen mínimo
                                <input type="number" min="0" step="0.01" value={item.minMarginPercent} onChange={(e) => updateItem(idx, 'minMarginPercent', parseFloat(e.target.value) || 0)} className="w-16 px-2 py-1 border border-gray-200 rounded text-right" />%
                              </label>
                              {floorPrice > 0 && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(bfVenta || bfMinorista || bfEspecial) ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-500'}`}>
                                  Piso: S/ {floorPrice.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Cabecera de columnas */}
                          <div className="grid grid-cols-3 gap-3 mb-1">
                            <span className="text-[11px] font-medium text-gray-400 text-center">% Margen</span>
                            <span className="text-[11px] font-medium text-gray-400 text-center">Precio / und</span>
                            <span className="text-[11px] font-medium text-gray-400 text-center">Utilidad / und</span>
                          </div>

                          <div className="space-y-2">
                            {/* ── Tier 0: P. Venta ── */}
                            <div className="grid grid-cols-3 gap-3 items-end">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1.5 flex items-center justify-between">
                                  <span>{tierLabel(0)}</span>
                                  {item.precioVentaMode === 'direct' && <span className="text-[10px] text-blue-500 font-medium">calculado</span>}
                                </label>
                                <input type="number" min="0" step="0.01" value={item.markupPercent || ''} onChange={(e) => updateItem(idx, 'markupPercent', parseFloat(e.target.value) || 0)} className={`w-full px-3 py-2 border rounded-lg text-sm ${item.precioVentaMode === 'direct' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`} placeholder="20" />
                              </div>
                              <div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                                  <input type="number" min="0" step="0.01" value={item.precioVenta || ''} onChange={(e) => updateItem(idx, 'precioVenta', parseFloat(e.target.value) || 0)} className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${bfVenta ? 'border-red-400 bg-red-50 text-red-700' : item.precioVentaMode === 'markup' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`} placeholder="0.00" />
                                </div>
                                {bfVenta && <p className="text-[10px] text-red-600 mt-0.5">Menor al precio piso</p>}
                              </div>
                              <div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                                  <input type="text" readOnly value={item.precioVenta > 0 ? utilidad.toFixed(2) : '—'} className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-semibold ${item.precioVenta > 0 ? (isUtilidadPos ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700') : 'border-gray-100 bg-gray-50 text-gray-400'}`} />
                                </div>
                              </div>
                            </div>

                            {/* ── Tier 1: P. Rebaja ── */}
                            <div className="grid grid-cols-3 gap-3 items-end">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1.5 flex items-center justify-between">
                                  <span>{tierLabel(1)}</span>
                                  {item.precioMinoristaMode === 'direct' && <span className="text-[10px] text-blue-500 font-medium">calculado</span>}
                                </label>
                                <input type="number" min="0" step="0.01" value={item.markupMinoristaPercent || ''} onChange={(e) => updateItem(idx, 'markupMinoristaPercent', parseFloat(e.target.value) || 0)} className={`w-full px-3 py-2 border rounded-lg text-sm ${item.precioMinoristaMode === 'direct' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`} placeholder="15" />
                              </div>
                              <div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                                  <input type="number" min="0" step="0.01" value={item.precioMinorista || ''} onChange={(e) => updateItem(idx, 'precioMinorista', parseFloat(e.target.value) || 0)} className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${bfMinorista ? 'border-red-400 bg-red-50 text-red-700' : item.precioMinoristaMode === 'markup' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`} placeholder="0.00" />
                                </div>
                                {bfMinorista && <p className="text-[10px] text-red-600 mt-0.5">Menor al precio piso</p>}
                              </div>
                              <div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                                  <input type="text" readOnly value={item.precioMinorista > 0 ? utilidadMinorista.toFixed(2) : '—'} className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-semibold ${item.precioMinorista > 0 ? (utilidadMinorista >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700') : 'border-gray-100 bg-gray-50 text-gray-400'}`} />
                                </div>
                              </div>
                            </div>

                            {/* ── Tier 2: P. Especial ── */}
                            <div className="grid grid-cols-3 gap-3 items-end">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1.5 flex items-center justify-between">
                                  <span>{tierLabel(2)}</span>
                                  {item.precioEspecialMode === 'direct' && <span className="text-[10px] text-blue-500 font-medium">calculado</span>}
                                </label>
                                <input type="number" min="0" step="0.01" value={item.markupEspecialPercent || ''} onChange={(e) => updateItem(idx, 'markupEspecialPercent', parseFloat(e.target.value) || 0)} className={`w-full px-3 py-2 border rounded-lg text-sm ${item.precioEspecialMode === 'direct' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`} placeholder="10" />
                              </div>
                              <div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                                  <input type="number" min="0" step="0.01" value={item.precioEspecial || ''} onChange={(e) => updateItem(idx, 'precioEspecial', parseFloat(e.target.value) || 0)} className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${bfEspecial ? 'border-red-400 bg-red-50 text-red-700' : item.precioEspecialMode === 'markup' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`} placeholder="0.00" />
                                </div>
                                {bfEspecial && <p className="text-[10px] text-red-600 mt-0.5">Menor al precio piso</p>}
                              </div>
                              <div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                                  <input type="text" readOnly value={item.precioEspecial > 0 ? utilidadEspecial.toFixed(2) : '—'} className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-semibold ${item.precioEspecial > 0 ? (utilidadEspecial >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700') : 'border-gray-100 bg-gray-50 text-gray-400'}`} />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Utilidad estimada × cantidad */}
                          {item.quantity > 0 && item.costoAdquisicion > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center flex-wrap gap-x-4 gap-y-1 justify-between">
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                <span className="font-medium text-gray-400">Utilidad Estimada:</span>
                                {item.precioVenta > 0 && <span>{tierLabel(0)}: <span className={`font-semibold ${utilidad * item.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>S/ {(utilidad * item.quantity).toFixed(2)}</span></span>}
                                {item.precioMinorista > 0 && <span>{tierLabel(1)}: <span className={`font-semibold ${utilidadMinorista * item.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>S/ {(utilidadMinorista * item.quantity).toFixed(2)}</span></span>}
                                {item.precioEspecial > 0 && <span>{tierLabel(2)}: <span className={`font-semibold ${utilidadEspecial * item.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>S/ {(utilidadEspecial * item.quantity).toFixed(2)}</span></span>}
                              </div>
                              <span className="ml-auto text-xs text-gray-500">Subtotal: <span className="font-semibold text-gray-700">S/ {(item.quantity * item.costoAdquisicion).toFixed(2)}</span></span>
                            </div>
                          )}
                        </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                  </div>{/* /p-4 */}
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Bonificaciones */}
        <SectionCard title={`Bonificaciones${bonificationItems.filter(i => i.productId && i.quantity > 0).length > 0 ? ` (${bonificationItems.filter(i => i.productId && i.quantity > 0).length})` : ''}`} icon={Gift} className="border-purple-200" iconClassName="text-purple-600">
          <div className="mb-3 flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5 text-xs text-purple-700">
            <Gift size={13} className="flex-shrink-0 mt-0.5" />
            <span>Los productos bonificados <strong>aumentan el stock</strong> pero <strong>no afectan el precio</strong> ni la cuenta por pagar.</span>
          </div>
          <div className="space-y-3">
            {bonificationItems.map((bonif, idx) => {
              const bonifProduct = products.find((p: Product) => p.id === bonif.productId);
              const needsLot = bonifProduct?.tracksLot;
              return (
                <div key={idx} className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between bg-purple-100 border-b border-purple-200 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <span className="text-xs font-medium text-purple-800">
                        {bonifProduct ? bonifProduct.name : <span className="text-purple-500 font-normal">Sin seleccionar</span>}
                      </span>
                      <span className="text-[10px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded font-medium">BONIF</span>
                    </div>
                    <button type="button" onClick={() => removeBonifItem(idx)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="p-3 grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-xs text-purple-700 mb-1">Producto</label>
                      <SearchableSelect
                        options={products.map((p: Product) => ({ value: p.id, label: p.name }))}
                        value={bonif.productId}
                        onChange={(v) => updateBonifItem(idx, 'productId', v)}
                        placeholder="Buscar producto..."
                        minChars={1}
                        required
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="block text-xs text-purple-700 mb-1">Cantidad</label>
                      <input type="number" min="0.01" step="0.01" value={bonif.quantity || ''} onChange={(e) => updateBonifItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-purple-300 rounded text-sm bg-white" required />
                    </div>
                    <div className="col-span-8 sm:col-span-3">
                      <label className="block text-xs text-purple-700 mb-1">
                        Lote {needsLot && <span className="text-red-500">*</span>}
                      </label>
                      <input value={bonif.lotNumber} onChange={(e) => updateBonifItem(idx, 'lotNumber', e.target.value)} placeholder={needsLot ? 'L-303123123' : 'Opcional'} className={`w-full px-2 py-1.5 border rounded text-sm ${needsLot && !bonif.lotNumber ? 'border-red-300 bg-red-50' : 'border-purple-300 bg-white'}`} />
                    </div>
                    <div className="col-span-12 sm:col-span-2">
                      <label className="block text-xs text-purple-700 mb-1">Vence</label>
                      <input type="date" value={bonif.expirationDate} onChange={(e) => updateBonifItem(idx, 'expirationDate', e.target.value)} className="w-full px-2 py-1.5 border border-purple-300 rounded text-sm bg-white" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addBonifItem} className="mt-2 flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium">
            <Gift size={14} /> Agregar bonificación
          </button>
        </SectionCard>

        {/* Barra de acciones sticky */}
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 px-4 lg:px-8 py-3 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-3 max-w-full">
            <div className="text-xs text-gray-500 hidden sm:block">
              {form.items.length} producto{form.items.length !== 1 ? 's' : ''}
              {creditTotal > 0 && <> · Total <span className="font-semibold text-gray-700">S/ {creditTotal.toFixed(2)}</span></>}
            </div>
            <div className="flex gap-2 ml-auto">
              <Link to="/purchases" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancelar</Link>
              <button type="submit" disabled={(currency === 'USD' ? (!exchangeRate || !form.totalCostUsd) : !form.totalCostPen) || createPurchase.isPending} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                {createPurchase.isPending ? 'Registrando...' : isHistorical ? 'Registrar Factura Histórica' : 'Registrar Compra'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Modal crear producto rápido */}
      <Modal isOpen={showNewProduct} onClose={() => setShowNewProduct(false)} title="Crear Producto Rápido">
        <form onSubmit={handleCreateQuickProduct} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del producto</label>
            <input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Agrifo, Campal..." required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select value={newProduct.categoryId} onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required>
              <option value="">Seleccionar...</option>
              {categories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
            <select value={newProduct.unit} onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="unidad">Unidad</option>
              <option value="kg">Kilogramo</option>
              <option value="litro">Litro</option>
              <option value="saco">Saco</option>
              <option value="caja">Caja</option>
            </select>
          </div>
          <button type="submit" disabled={createProduct.isPending} className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
            {createProduct.isPending ? 'Creando...' : 'Crear Producto'}
          </button>
        </form>
      </Modal>

      {/* ── Confirmation modal ── */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Confirmar registro de compra">
        <div className="space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              Se registrarán <span className="font-semibold text-gray-900">{pendingPayload?.items?.length ?? 0} producto(s)</span> en esta compra.
              {(pendingPayload?.bonificationItems?.length ?? 0) > 0 && (
                <> + <span className="font-semibold text-purple-700">{pendingPayload.bonificationItems.length} bonificación(es)</span></>
              )}
            </p>
            <p>
              Tipo de pago:{' '}
              <span className="font-semibold text-gray-900">
                {pendingPayload?.paymentType === 'CREDITO' ? 'Crédito' : pendingPayload?.paymentType === 'PENDIENTE_ACUERDO' ? 'Pendiente de acuerdo' : 'Contado'}
              </span>
            </p>
            {pendingPayload?.paymentType === 'CREDITO' && (
              <p>
                {pendingPayload?.paymentScheduleType === 'INSTALLMENTS'
                  ? <>Cuotas: <span className="font-semibold text-gray-900">{pendingPayload?.installments?.length ?? 0}</span></>
                  : <>Vencimiento: <span className="font-semibold text-gray-900">{pendingPayload?.dueDate}</span></>
                }
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={createPurchase.isPending}
              className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
            >
              {createPurchase.isPending ? 'Registrando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
