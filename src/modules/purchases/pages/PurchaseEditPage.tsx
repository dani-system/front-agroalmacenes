import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePurchase, usePurchaseAccountPayable, useUpdatePurchase, useEditPurchaseItems } from '../hooks/usePurchases';
import { useProducts } from '../../products/hooks/useProducts';
import { useProductLots } from '../../stock/hooks/useProductLots';
import { usePriceTiers } from '../../price-tiers/hooks/usePriceTiers';
import {
  ArrowLeft, Save, AlertTriangle, Trash2, Plus, Lock, Dices,
  Building2, FileText, DollarSign, CreditCard, ShoppingCart, Package, Pencil, Check, X, Gift,
} from 'lucide-react';
import type { ProductLot } from '../../../shared/types';
import { productService } from '../../products/services/productService';
import toast from 'react-hot-toast';

const DOCUMENT_TYPES = ['FACTURA', 'BOLETA', 'GUIA', 'NOTA_CREDITO', 'OTRO'] as const;

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

const emptyNewItem = (): PurchaseFormItem => ({
  productId: '', quantity: 0, lotNumber: '', expirationDate: '',
  taxType: 'GRAVADO', unitPriceSinIgv: 0, unitPriceConIgv: 0, flete: 0, otrosCostos: 0,
  costoAdquisicion: 0, markupPercent: 20, precioVenta: 0,
  markupMinoristaPercent: 15, precioMinorista: 0,
  markupEspecialPercent: 10, precioEspecial: 0,
  minMarginPercent: 5,
  precioVentaMode: 'markup', precioMinoristaMode: 'markup', precioEspecialMode: 'markup',
});

function recalcNewItem(item: PurchaseFormItem, tc: number, isUsd: boolean): PurchaseFormItem {
  const isExempt = item.taxType === 'INAFECTO' || item.taxType === 'EXONERADO';
  const unitPriceConIgv = isExempt
    ? item.unitPriceSinIgv
    : Math.round(item.unitPriceSinIgv * (1 + IGV_RATE) * 100) / 100;
  const unitConIgvPen = isUsd ? Math.round(unitPriceConIgv * tc * 100) / 100 : unitPriceConIgv;
  const costoAdquisicion = Math.round((unitConIgvPen + item.flete + item.otrosCostos) * 100) / 100;

  let precioVenta = item.precioVenta;
  let markupPercent = item.markupPercent;
  if (item.precioVentaMode === 'markup') {
    precioVenta = costoAdquisicion > 0 ? Math.round(costoAdquisicion * (1 + markupPercent / 100) * 100) / 100 : 0;
  } else {
    markupPercent = costoAdquisicion > 0 ? Math.round(((precioVenta / costoAdquisicion) - 1) * 10000) / 100 : 0;
  }

  let precioMinorista = item.precioMinorista;
  let markupMinoristaPercent = item.markupMinoristaPercent;
  if (item.precioMinoristaMode === 'markup') {
    precioMinorista = costoAdquisicion > 0 ? Math.round(costoAdquisicion * (1 + markupMinoristaPercent / 100) * 100) / 100 : 0;
  } else {
    markupMinoristaPercent = costoAdquisicion > 0 ? Math.round(((precioMinorista / costoAdquisicion) - 1) * 10000) / 100 : 0;
  }

  let precioEspecial = item.precioEspecial;
  let markupEspecialPercent = item.markupEspecialPercent;
  if (item.precioEspecialMode === 'markup') {
    precioEspecial = costoAdquisicion > 0 ? Math.round(costoAdquisicion * (1 + markupEspecialPercent / 100) * 100) / 100 : 0;
  } else {
    markupEspecialPercent = costoAdquisicion > 0 ? Math.round(((precioEspecial / costoAdquisicion) - 1) * 10000) / 100 : 0;
  }

  return { ...item, unitPriceConIgv, costoAdquisicion, precioVenta, markupPercent, precioMinorista, markupMinoristaPercent, precioEspecial, markupEspecialPercent };
}

function toInputDate(val: any): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function SectionCard({ title, icon: Icon, children, iconClassName = 'text-primary-600' }: { title: string; icon: any; children: React.ReactNode; iconClassName?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Icon size={15} className={`${iconClassName} flex-shrink-0`} />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1">{children}</label>;
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white transition';
const inputDisabledCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed';
const inputSmCls = 'w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white transition';

interface FormState {
  supplier: string;
  supplierRuc: string;
  date: string;
  documentType: string;
  documentSeries: string;
  documentNumber: string;
  issueDate: string;
  paymentType: 'CONTADO' | 'CREDITO' | 'PENDIENTE_ACUERDO';
  paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS';
  dueDate: string;
  installments: { amount: number; dueDate: string }[];
  totalCostUsd: string;
  exchangeRate: string;
}

interface ItemEdit {
  quantity: number;
  unitCost: number;
  precioVenta: number;
  precioMinorista: number;
  precioEspecial: number;
  markupPercent: number;
  markupMinoristaPercent: number;
  markupEspecialPercent: number;
  minMarginPercent: number;
  lotNumber: string;
  expirationDate: string;
}


function getItemEditability(
  item: any,
  products: any[],
  lots: ProductLot[],
  receptionStatus?: string,
  isHistorical?: boolean,
): { editable: boolean; reason: string } {
  if (isHistorical) {
    return { editable: true, reason: '' };
  }
  if (receptionStatus === 'PENDING') {
    return { editable: true, reason: '' };
  }
  const product = products.find((p) => p.id === item.productId);
  if (!product?.tracksLot) {
    return { editable: false, reason: 'Sin trazabilidad de lote — solo se permiten cambios de precio' };
  }
  if (!item.lotNumber) {
    return { editable: false, reason: 'Sin número de lote registrado' };
  }
  const lot = lots.find(
    (l) => l.productId === item.productId && l.lotNumber === item.lotNumber,
  );
  if (!lot) {
    return { editable: false, reason: 'Lote no encontrado en inventario' };
  }
  if (lot.currentQuantity < lot.initialQuantity) {
    const sold = lot.initialQuantity - lot.currentQuantity;
    return { editable: false, reason: `${sold} unidad(es) ya vendidas` };
  }
  return { editable: true, reason: '' };
}

export function PurchaseEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: purchase, isLoading: loadingPurchase } = usePurchase(id!);
  const { data: ap, isLoading: loadingAp } = usePurchaseAccountPayable(id!);
  const updatePurchase = useUpdatePurchase();
  const editItems = useEditPurchaseItems();

  const companyId = (purchase as any)?.companyId ?? '';
  const { data: productsData } = useProducts({ limit: 9999 });
  const products: any[] = Array.isArray(productsData) ? productsData : (productsData as any)?.data ?? [];
  const { data: lotsData } = useProductLots(companyId);
  const lots: ProductLot[] = lotsData ?? [];
  const { data: priceTiersData } = usePriceTiers();
  const sortedTiers = (Array.isArray(priceTiersData) ? priceTiersData : [])
    .filter((t: any) => t.isActive)
    .sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0));
  const tierLabel = (idx: number) => sortedTiers[idx]?.name ? `P. ${sortedTiers[idx].name}` : ['P. Mayorista', 'P. Rebaja', 'P. Especial'][idx];

  const [form, setForm] = useState<FormState | null>(null);

  // Item editing state: productId → edit form
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEdit>>({});
  const itemEditsRef = useRef(itemEdits);
  itemEditsRef.current = itemEdits;

  // New item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState<PurchaseFormItem>(emptyNewItem());

  // Bonification form
  interface BonifForm { productId: string; quantity: number; lotNumber: string; expirationDate: string; }
  const [showAddBonif, setShowAddBonif] = useState(false);
  const [newBonif, setNewBonif] = useState<BonifForm>({ productId: '', quantity: 0, lotNumber: '', expirationDate: '' });
  const [bonifSearch, setBonifSearch] = useState('');
  const [bonifSearchLabel, setBonifSearchLabel] = useState('');
  const [debouncedBonifSearch, setDebouncedBonifSearch] = useState('');
  const [showBonifResults, setShowBonifResults] = useState(false);
  const [bonifResults, setBonifResults] = useState<any[]>([]);
  const [bonifResultsLoading, setBonifResultsLoading] = useState(false);

  // Product search for add-item form (server-side, debounced)
  const [productSearch, setProductSearch] = useState('');
  const [productSearchLabel, setProductSearchLabel] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [productResults, setProductResults] = useState<any[]>([]);
  const [productResultsLoading, setProductResultsLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(productSearch), 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  useEffect(() => {
    if (debouncedSearch.length < 2) { setProductResults([]); return; }
    setProductResultsLoading(true);
    productService.getAll({ search: debouncedSearch, limit: 20 })
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setProductResults(list);
      })
      .catch(() => setProductResults([]))
      .finally(() => setProductResultsLoading(false));
  }, [debouncedSearch, purchase?.items]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBonifSearch(bonifSearch), 300);
    return () => clearTimeout(t);
  }, [bonifSearch]);

  useEffect(() => {
    if (debouncedBonifSearch.length < 2) { setBonifResults([]); return; }
    setBonifResultsLoading(true);
    productService.getAll({ search: debouncedBonifSearch, limit: 20 })
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setBonifResults(list);
      })
      .catch(() => setBonifResults([]))
      .finally(() => setBonifResultsLoading(false));
  }, [debouncedBonifSearch]);

  useEffect(() => {
    if (!purchase) return;
    const apInstallments = ap?.installments?.map((i: any) => ({
      amount: i.amount,
      dueDate: toInputDate(i.dueDate),
    })) ?? [];

    const payType: FormState['paymentType'] =
      (ap?.paymentScheduleType === 'PENDIENTE_ACUERDO' || purchase.paymentType === 'PENDIENTE_ACUERDO')
        ? 'PENDIENTE_ACUERDO'
        : purchase.paymentType === 'CREDITO' ? 'CREDITO' : 'CONTADO';

    const schedType: FormState['paymentScheduleType'] =
      ap?.paymentScheduleType === 'INSTALLMENTS' ? 'INSTALLMENTS' : 'SINGLE_DATE';

    setForm({
      supplier: purchase.supplier ?? '',
      supplierRuc: (purchase as any).supplierRuc ?? '',
      date: toInputDate(purchase.date),
      documentType: purchase.documentType ?? '',
      documentSeries: purchase.documentSeries ?? '',
      documentNumber: purchase.documentNumber ?? '',
      issueDate: toInputDate(purchase.issueDate),
      paymentType: payType,
      paymentScheduleType: schedType,
      dueDate: toInputDate(ap?.dueDate),
      installments: apInstallments.length > 0 ? apInstallments : [],
      totalCostUsd: purchase.totalCostUsd != null ? String(purchase.totalCostUsd) : '',
      exchangeRate: purchase.exchangeRate != null ? String(purchase.exchangeRate) : '',
    });
  }, [purchase, ap]);

  if (loadingPurchase || loadingAp || !form) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="flex items-center gap-3 mb-6">
        <Link to="/purchases" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-bold text-gray-800">Compra no encontrada</h1>
      </div>
    );
  }

  const isUsdPurchase = purchase.totalCostUsd != null;
  const tc = parseFloat(form.exchangeRate) || 1;
  const apHasPayments = (ap?.paidAmount ?? 0) > 0;
  const apConsolidated = ap?.status === 'CONSOLIDATED';
  const paymentLocked = apHasPayments || apConsolidated;

  const setF = (patch: Partial<FormState>) =>
    setForm(prev => (prev ? { ...prev, ...patch } : prev));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Auto-save any pending item edit before saving the form
    if (editingItem) {
      const pendingItem = purchase.items?.find((i: any) => i.productId === editingItem);
      if (pendingItem) await saveEditItem(editingItem, pendingItem);
    }

    const payload: any = {
      supplier: form.supplier.trim() || undefined,
      supplierRuc: form.supplierRuc.trim() || undefined,
      date: form.date || undefined,
      documentType: form.documentType || undefined,
      documentSeries: form.documentSeries.trim() || undefined,
      documentNumber: form.documentNumber.trim() || undefined,
      issueDate: form.issueDate || undefined,
    };

    if (!paymentLocked) {
      payload.paymentType = form.paymentType;
      if (form.paymentType === 'CREDITO') {
        payload.paymentScheduleType = form.paymentScheduleType;
        if (form.paymentScheduleType === 'SINGLE_DATE') {
          if (!form.dueDate) { toast.error('Ingresa la fecha de vencimiento'); return; }
          payload.dueDate = form.dueDate;
        }
        if (form.paymentScheduleType === 'INSTALLMENTS') {
          if (form.installments.length === 0) { toast.error('Agrega al menos una cuota'); return; }
          const hasEmpty = form.installments.some(i => !i.dueDate || i.amount <= 0);
          if (hasEmpty) { toast.error('Completa monto y fecha de todas las cuotas'); return; }
          payload.installments = form.installments;
        }
      }
      if (isUsdPurchase) {
        if (form.totalCostUsd) payload.totalCostUsd = parseFloat(form.totalCostUsd);
        if (form.exchangeRate) payload.exchangeRate = parseFloat(form.exchangeRate);
      }
    }

    await updatePurchase.mutateAsync({ id: id!, data: payload });
    navigate(`/purchases/${id}`);
  };

  // ── Item editing ──────────────────────────────────────────────────────────

  const startEditItem = (productId: string, item: any) => {
    const unitCost = item.unitCost ?? 0;
    const markupFromPrice = (price: number | undefined, fallback: number) =>
      unitCost > 0 && (price ?? 0) > 0 ? Math.round((((price ?? 0) / unitCost) - 1) * 10000) / 100 : fallback;
    const product = products.find((p) => p.id === productId);
    setItemEdits(prev => ({
      ...prev,
      [productId]: {
        quantity: item.quantity,
        unitCost: item.unitCost ?? 0,
        precioVenta: item.precioVenta ?? 0,
        precioMinorista: item.precioMinorista ?? 0,
        precioEspecial: item.precioEspecial ?? 0,
        markupPercent: item.markupPercent ?? markupFromPrice(item.precioVenta, 20),
        markupMinoristaPercent: item.markupMinoristaPercent ?? markupFromPrice(item.precioMinorista, 15),
        markupEspecialPercent: item.markupEspecialPercent ?? markupFromPrice(item.precioEspecial, 10),
        minMarginPercent: item.minMarginPercent ?? product?.minMarginPercent ?? 5,
        lotNumber: item.lotNumber ?? '',
        expirationDate: toInputDate(item.expirationDate),
      },
    }));
    setEditingItem(productId);
  };

  const cancelEditItem = () => setEditingItem(null);

  const updateExistingItemPricing = (productId: string, field: keyof ItemEdit, value: number) => {
    setItemEdits(prev => {
      const current = prev[productId];
      if (!current) return prev;
      const next = { ...current, [field]: value };
      const fromMarkup = (percent: number) => next.unitCost > 0
        ? Math.round(next.unitCost * (1 + percent / 100) * 100) / 100
        : 0;
      const fromPrice = (price: number) => next.unitCost > 0
        ? Math.round(((price / next.unitCost) - 1) * 10000) / 100
        : 0;
      if (field === 'unitCost') {
        next.precioVenta = fromMarkup(next.markupPercent);
        next.precioMinorista = fromMarkup(next.markupMinoristaPercent);
        next.precioEspecial = fromMarkup(next.markupEspecialPercent);
      } else if (field === 'markupPercent') next.precioVenta = fromMarkup(value);
      else if (field === 'markupMinoristaPercent') next.precioMinorista = fromMarkup(value);
      else if (field === 'markupEspecialPercent') next.precioEspecial = fromMarkup(value);
      else if (field === 'precioVenta') next.markupPercent = fromPrice(value);
      else if (field === 'precioMinorista') next.markupMinoristaPercent = fromPrice(value);
      else if (field === 'precioEspecial') next.markupEspecialPercent = fromPrice(value);
      return { ...prev, [productId]: next };
    });
  };

  const updateNewItem = (field: string, value: any) => {
    setNewItem(prev => {
      let item: PurchaseFormItem = { ...prev, [field]: value };
      if (field === 'markupPercent') item = { ...item, precioVentaMode: 'markup' };
      if (field === 'precioVenta') item = { ...item, precioVentaMode: 'direct' };
      if (field === 'markupMinoristaPercent') item = { ...item, precioMinoristaMode: 'markup' };
      if (field === 'precioMinorista') item = { ...item, precioMinoristaMode: 'direct' };
      if (field === 'markupEspecialPercent') item = { ...item, precioEspecialMode: 'markup' };
      if (field === 'precioEspecial') item = { ...item, precioEspecialMode: 'direct' };
      if (field === 'productId') {
        const p = products.find((pr) => pr.id === value);
        item = { ...item, taxType: p?.taxType || 'GRAVADO' };
      }
      const costoFields = ['unitPriceSinIgv', 'flete', 'otrosCostos', 'taxType', 'markupPercent', 'precioVenta',
        'markupMinoristaPercent', 'precioMinorista', 'markupEspecialPercent', 'precioEspecial', 'productId'];
      if (costoFields.includes(field)) item = recalcNewItem(item, tc, isUsdPurchase);
      return item;
    });
  };

  const saveEditItem = async (productId: string, item: any) => {
    const edits = itemEditsRef.current[productId];
    if (!edits) return;
    const floor = Math.round(edits.unitCost * (1 + edits.minMarginPercent / 100) * 100) / 100;
    if ([edits.precioVenta, edits.precioMinorista, edits.precioEspecial].some(price => price > 0 && price < floor)) {
      toast.error(`Los precios de venta no pueden ser menores al precio piso (S/ ${floor.toFixed(2)})`);
      return;
    }

    const { editable } = getItemEditability(item, products, lots, purchase.receptionStatus, !!(purchase as any).isHistorical);

    const editPayload: any = { productId };
    if (editable) {
      editPayload.quantity = edits.quantity;
      if (edits.lotNumber !== (item.lotNumber ?? '')) editPayload.lotNumber = edits.lotNumber;
      if (edits.expirationDate !== toInputDate(item.expirationDate))
        editPayload.expirationDate = edits.expirationDate || null;
    }
    if (edits.unitCost !== (item.unitCost ?? 0)) editPayload.unitCost = edits.unitCost;
    if (edits.precioVenta !== (item.precioVenta ?? 0)) editPayload.precioVenta = edits.precioVenta;
    if (edits.precioMinorista !== (item.precioMinorista ?? 0)) editPayload.precioMinorista = edits.precioMinorista;
    if (edits.precioEspecial !== (item.precioEspecial ?? 0)) editPayload.precioEspecial = edits.precioEspecial;
    editPayload.markupPercent = edits.markupPercent;
    editPayload.markupMinoristaPercent = edits.markupMinoristaPercent;
    editPayload.markupEspecialPercent = edits.markupEspecialPercent;
    editPayload.minMarginPercent = edits.minMarginPercent;

    if (Object.keys(editPayload).length <= 1) {
      toast('Sin cambios que guardar');
      setEditingItem(null);
      return;
    }

    await editItems.mutateAsync({ id: id!, data: { companyId, edits: [editPayload] } });
    setEditingItem(null);
  };

  const handleAddItem = async () => {
    if (!newItem.productId || newItem.quantity <= 0) {
      toast.error('Selecciona un producto e ingresa la cantidad');
      return;
    }
    const product = products.find((p) => p.id === newItem.productId);
    if (product?.tracksLot && !newItem.lotNumber) {
      toast.error('Este producto requiere número de lote');
      return;
    }
    const floor = Math.round(newItem.costoAdquisicion * (1 + newItem.minMarginPercent / 100) * 100) / 100;
    if ([newItem.precioVenta, newItem.precioMinorista, newItem.precioEspecial].some(price => price > 0 && price < floor)) {
      toast.error(`Los precios de venta no pueden ser menores al precio piso (S/ ${floor.toFixed(2)})`);
      return;
    }
    await editItems.mutateAsync({
      id: id!,
      data: {
        companyId,
        additions: [{
          productId: newItem.productId,
          quantity: newItem.quantity,
          unitCost: newItem.costoAdquisicion || undefined,
          unitPriceSinIgv: newItem.unitPriceSinIgv || undefined,
          unitPriceConIgv: newItem.unitPriceConIgv || undefined,
          flete: newItem.flete || undefined,
          otrosCostos: newItem.otrosCostos || undefined,
          precioVenta: newItem.precioVenta || undefined,
          precioMinorista: newItem.precioMinorista || undefined,
          precioEspecial: newItem.precioEspecial || undefined,
          markupPercent: newItem.markupPercent || undefined,
          markupMinoristaPercent: newItem.markupMinoristaPercent,
          markupEspecialPercent: newItem.markupEspecialPercent,
          minMarginPercent: newItem.minMarginPercent,
          lotNumber: newItem.lotNumber || undefined,
          expirationDate: newItem.expirationDate || undefined,
          taxType: newItem.taxType || undefined,
        }],
      },
    });
    setShowAddItem(false);
    setNewItem(emptyNewItem());
    setProductSearch('');
    setProductSearchLabel('');
  };

  const handleAddBonif = async () => {
    if (!newBonif.productId || newBonif.quantity <= 0) {
      toast.error('Selecciona un producto e ingresa la cantidad');
      return;
    }
    const bonifProduct = bonifResults.find((p: any) => p.id === newBonif.productId)
      ?? products.find((p) => p.id === newBonif.productId);
    if (bonifProduct?.tracksLot && !newBonif.lotNumber) {
      toast.error('Este producto requiere número de lote');
      return;
    }
    await editItems.mutateAsync({
      id: id!,
      data: {
        companyId,
        bonificationAdditions: [{
          productId: newBonif.productId,
          quantity: newBonif.quantity,
          lotNumber: newBonif.lotNumber || undefined,
          expirationDate: newBonif.expirationDate || undefined,
        }],
      },
    });
    setShowAddBonif(false);
    setNewBonif({ productId: '', quantity: 0, lotNumber: '', expirationDate: '' });
    setBonifSearch('');
    setBonifSearchLabel('');
  };

  const instTotal = form.installments.reduce((s, i) => s + (i.amount || 0), 0);
  const purchaseTotal = isUsdPurchase ? (parseFloat(form.totalCostUsd) || 0) : purchase.totalCost;
  const instDiff = form.installments.length > 0 && Math.abs(instTotal - purchaseTotal) > 0.01;
  const submitDisabled =
    updatePurchase.isPending ||
    (form.paymentType === 'CREDITO' && form.paymentScheduleType === 'INSTALLMENTS' && instDiff);

  const selectedNewProduct = productResults.find((p: any) => p.id === newItem.productId)
    ?? products.find((p) => p.id === newItem.productId);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to={`/purchases/${id}`}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
          title="Volver al detalle"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 flex items-center gap-1 mb-0.5">
            <ShoppingCart size={12} /> Compras / Detalle
          </div>
          <h1 className="text-xl font-bold text-gray-800">Editar Compra</h1>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="space-y-5">
        {/* ── Metadata form ── */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

            {/* LEFT COLUMN */}
            <div className="lg:col-span-3 space-y-5">

              <SectionCard title="Información general" icon={Building2}>
                <div>
                  <FieldLabel>Proveedor</FieldLabel>
                  <input
                    type="text" value={form.supplier}
                    onChange={e => setF({ supplier: e.target.value })}
                    className={inputCls}
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>RUC del proveedor</FieldLabel>
                    <input
                      type="text" value={form.supplierRuc} maxLength={11}
                      onChange={e => setF({ supplierRuc: e.target.value.replace(/\D/g, '') })}
                      className={inputCls}
                      placeholder="20xxxxxxxxx"
                    />
                  </div>
                  <div>
                    <FieldLabel>Fecha de compra</FieldLabel>
                    <input
                      type="date" value={form.date}
                      onChange={e => setF({ date: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Comprobante" icon={FileText}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Tipo de comprobante</FieldLabel>
                    <select
                      value={form.documentType}
                      onChange={e => setF({ documentType: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">— Sin especificar —</option>
                      {DOCUMENT_TYPES.map(t => (
                        <option key={t} value={t}>{t.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Fecha de emisión</FieldLabel>
                    <input
                      type="date" value={form.issueDate}
                      onChange={e => setF({ issueDate: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel>Serie</FieldLabel>
                    <input
                      type="text" value={form.documentSeries} maxLength={4}
                      onChange={e => setF({ documentSeries: e.target.value.toUpperCase() })}
                      className={`${inputCls} font-mono`}
                      placeholder="F001"
                    />
                  </div>
                  <div>
                    <FieldLabel>Número</FieldLabel>
                    <input
                      type="text" value={form.documentNumber} maxLength={8}
                      onChange={e => setF({ documentNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                      className={`${inputCls} font-mono`}
                      placeholder="00001234"
                    />
                  </div>
                </div>
              </SectionCard>

              {isUsdPurchase && (
                <SectionCard title="Moneda y tipo de cambio" icon={DollarSign}>
                  {apHasPayments && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <Lock size={13} className="flex-shrink-0" />
                      No se puede modificar: ya hay pagos registrados
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Total USD</FieldLabel>
                      <input
                        type="number" step="0.01" min="0"
                        value={form.totalCostUsd}
                        onChange={e => setF({ totalCostUsd: e.target.value })}
                        disabled={apHasPayments}
                        className={apHasPayments ? inputDisabledCls : inputCls}
                      />
                    </div>
                    <div>
                      <FieldLabel>Tipo de cambio</FieldLabel>
                      <input
                        type="number" step="0.0001" min="0"
                        value={form.exchangeRate}
                        onChange={e => setF({ exchangeRate: e.target.value })}
                        disabled={apHasPayments}
                        className={apHasPayments ? inputDisabledCls : inputCls}
                      />
                    </div>
                  </div>
                  {form.totalCostUsd && form.exchangeRate && (
                    <p className="text-xs text-gray-500">
                      Equivale a:{' '}
                      <span className="font-semibold text-gray-700">
                        S/ {(parseFloat(form.totalCostUsd) * parseFloat(form.exchangeRate)).toFixed(2)}
                      </span>
                    </p>
                  )}
                </SectionCard>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-2 lg:sticky lg:top-6 space-y-5">
              <SectionCard title="Tipo de pago" icon={CreditCard}>

                {paymentLocked && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <Lock size={13} className="flex-shrink-0" />
                    {apConsolidated
                      ? 'Consolidado en un acuerdo de pago activo'
                      : 'Ya hay pagos registrados en esta cuenta'}
                  </div>
                )}

                {paymentLocked ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
                    <span className="font-medium text-gray-800">
                      {form.paymentType === 'PENDIENTE_ACUERDO'
                        ? 'Pendiente de acuerdo'
                        : form.paymentType === 'CREDITO'
                        ? 'Crédito'
                        : 'Contado'}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      Las condiciones de pago no pueden editarse.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setF({ paymentType: 'CONTADO', paymentScheduleType: 'SINGLE_DATE', dueDate: '', installments: [] })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition ${form.paymentType === 'CONTADO' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        Contado
                      </button>
                      <button
                        type="button"
                        onClick={() => setF({ paymentType: 'CREDITO' })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition ${form.paymentType === 'CREDITO' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        Crédito
                      </button>
                      <button
                        type="button"
                        onClick={() => setF({ paymentType: 'PENDIENTE_ACUERDO', paymentScheduleType: 'SINGLE_DATE', dueDate: '', installments: [] })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition ${form.paymentType === 'PENDIENTE_ACUERDO' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        Acuerdo
                      </button>
                    </div>

                    {form.paymentType === 'PENDIENTE_ACUERDO' && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5 text-xs text-purple-700">
                        La factura quedará pendiente de asignación a un acuerdo de pago.
                      </div>
                    )}

                    {form.paymentType === 'CREDITO' && (
                      <div className="space-y-3">
                        <div className="flex gap-2 bg-orange-50 border border-orange-200 rounded-lg p-1.5">
                          <button
                            type="button"
                            onClick={() => setF({ paymentScheduleType: 'SINGLE_DATE', installments: [] })}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition ${form.paymentScheduleType === 'SINGLE_DATE' ? 'bg-white border border-orange-400 text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            Fecha única
                          </button>
                          <button
                            type="button"
                            onClick={() => setF({ paymentScheduleType: 'INSTALLMENTS', dueDate: '' })}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition ${form.paymentScheduleType === 'INSTALLMENTS' ? 'bg-white border border-orange-400 text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            Cuotas
                          </button>
                        </div>

                        {form.paymentScheduleType === 'SINGLE_DATE' && (
                          <div>
                            <FieldLabel>Fecha de vencimiento</FieldLabel>
                            <input
                              type="date" value={form.dueDate} required
                              onChange={e => setF({ dueDate: e.target.value })}
                              className={inputCls}
                            />
                          </div>
                        )}

                        {form.paymentScheduleType === 'INSTALLMENTS' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-600">
                                Cuotas ({form.installments.length})
                              </span>
                              {instDiff && (
                                <span className="flex items-center gap-1 text-[11px] text-red-600">
                                  <AlertTriangle size={11} />
                                  Suma {isUsdPurchase ? '$' : 'S/'} {instTotal.toFixed(2)} ≠ total {isUsdPurchase ? '$' : 'S/'} {purchaseTotal.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="space-y-2">
                              {form.installments.map((inst, idx) => (
                                <div key={idx} className="bg-orange-50 border border-orange-100 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-800 text-[10px] font-bold flex items-center justify-center">
                                      {idx + 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setF({ installments: form.installments.filter((_, i) => i !== idx) })}
                                      className="text-red-400 hover:text-red-600 p-0.5 rounded transition"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <FieldLabel>Monto ({isUsdPurchase ? 'USD' : 'S/'})</FieldLabel>
                                      <input
                                        type="number" step="0.01" min="0"
                                        value={inst.amount || ''}
                                        onChange={e => {
                                          const ins = [...form.installments];
                                          ins[idx] = { ...ins[idx], amount: parseFloat(e.target.value) || 0 };
                                          setF({ installments: ins });
                                        }}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                                        placeholder="0.00"
                                      />
                                    </div>
                                    <div>
                                      <FieldLabel>Vencimiento</FieldLabel>
                                      <input
                                        type="date" value={inst.dueDate}
                                        onChange={e => {
                                          const ins = [...form.installments];
                                          ins[idx] = { ...ins[idx], dueDate: e.target.value };
                                          setF({ installments: ins });
                                        }}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setF({ installments: [...form.installments, { amount: 0, dueDate: '' }] })}
                              className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 font-medium py-1 transition"
                            >
                              <Plus size={13} /> Agregar cuota
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </SectionCard>

              <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
                <Link
                  to={`/purchases/${id}`}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 text-center transition"
                >
                  Cancelar
                </Link>
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
                >
                  <Save size={15} />
                  {updatePurchase.isPending ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* ── Products section ── */}
        <SectionCard title={`Productos (${purchase.items?.length ?? 0})`} icon={Package}>
          <div className="space-y-3">
            {(purchase.items ?? []).map((item: any) => {
              const { editable, reason } = getItemEditability(item, products, lots, purchase.receptionStatus, !!(purchase as any).isHistorical);
              const isEditing = editingItem === item.productId;
              const edits = itemEdits[item.productId];
              const product = products.find((p) => p.id === item.productId);

              return (
                <div key={item.productId} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  {/* Item header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {item.productName || product?.name || item.productId}
                      </p>
                      <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                        <span>Cant: <b>{item.quantity}</b></span>
                        {item.receivedQty != null && <span>Recibido: <b>{item.receivedQty}</b></span>}
                        {item.lotNumber && <span>Lote: <b>{item.lotNumber}</b></span>}
                        {item.expirationDate && <span>Vence: <b>{toInputDate(item.expirationDate)}</b></span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!editable && (
                        <span title={reason} className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                          <Lock size={10} />
                          {reason.split('—')[0].trim()}
                        </span>
                      )}
                      {!isEditing && (
                        <button
                          onClick={() => startEditItem(item.productId, item)}
                          className="p-1.5 rounded-lg hover:bg-white text-gray-400 hover:text-primary-600 transition"
                          title="Editar item"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {isEditing && (
                        <>
                          <button
                            onClick={() => saveEditItem(item.productId, item)}
                            disabled={editItems.isPending}
                            className="p-1.5 rounded-lg bg-primary-100 text-primary-700 hover:bg-primary-200 transition"
                            title="Guardar"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={cancelEditItem}
                            className="p-1.5 rounded-lg hover:bg-white text-gray-400 hover:text-red-500 transition"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {isEditing && edits && (
                    <div className="mt-3 border-t border-gray-200 pt-4 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">Datos de compra</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {editable && (
                            <div>
                              <FieldLabel>Cantidad comprada</FieldLabel>
                              <input type="number" min="1" step="1" value={edits.quantity} onChange={e => setItemEdits(prev => ({ ...prev, [item.productId]: { ...edits, quantity: parseInt(e.target.value) || 0 } }))} className={inputSmCls} />
                            </div>
                          )}
                          <div>
                            <FieldLabel>Costo de adquisición</FieldLabel>
                            <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">S/</span><input type="number" min="0" step="0.01" value={edits.unitCost} onChange={e => updateExistingItemPricing(item.productId, 'unitCost', parseFloat(e.target.value) || 0)} className={`${inputSmCls} pl-7`} /></div>
                          </div>
                          <div>
                            <FieldLabel>Margen mínimo (%)</FieldLabel>
                            <input type="number" min="0" step="0.01" value={edits.minMarginPercent} onChange={e => updateExistingItemPricing(item.productId, 'minMarginPercent', parseFloat(e.target.value) || 0)} className={inputSmCls} />
                          </div>
                          <div>
                            <FieldLabel>Precio piso calculado</FieldLabel>
                            <div className="px-3 py-1.5 rounded border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800">S/ {(edits.unitCost * (1 + edits.minMarginPercent / 100)).toFixed(2)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <div className="px-3 py-2 bg-gray-100 border-b border-gray-200"><p className="text-xs font-semibold text-gray-700">Precios de venta</p></div>
                        <div className="hidden sm:grid sm:grid-cols-3 gap-3 px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          <span>Tipo de precio</span><span>Margen (%)</span><span>Precio por unidad</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {([
                            { label: tierLabel(0), markupKey: 'markupPercent', priceKey: 'precioVenta' },
                            { label: tierLabel(1), markupKey: 'markupMinoristaPercent', priceKey: 'precioMinorista' },
                            { label: tierLabel(2), markupKey: 'markupEspecialPercent', priceKey: 'precioEspecial' },
                          ] as const).map(row => (
                            <div key={row.priceKey} className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 px-3 py-2.5 items-center">
                              <span className="text-xs font-medium text-gray-700">{row.label}</span>
                              <div><span className="sm:hidden block text-[10px] text-gray-400 mb-1">Margen (%)</span><input type="number" min="0" step="0.01" value={edits[row.markupKey]} onChange={e => updateExistingItemPricing(item.productId, row.markupKey, parseFloat(e.target.value) || 0)} className={inputSmCls} /></div>
                              <div><span className="sm:hidden block text-[10px] text-gray-400 mb-1">Precio por unidad</span><div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">S/</span><input type="number" min="0" step="0.01" value={edits[row.priceKey]} onChange={e => updateExistingItemPricing(item.productId, row.priceKey, parseFloat(e.target.value) || 0)} className={`${inputSmCls} pl-7`} /></div></div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {editable && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">Datos de inventario</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><FieldLabel>Número de lote</FieldLabel><input type="text" value={edits.lotNumber} onChange={e => setItemEdits(prev => ({ ...prev, [item.productId]: { ...edits, lotNumber: e.target.value } }))} className={inputSmCls} /></div>
                            <div><FieldLabel>Fecha de vencimiento</FieldLabel><input type="date" value={edits.expirationDate} onChange={e => setItemEdits(prev => ({ ...prev, [item.productId]: { ...edits, expirationDate: e.target.value } }))} className={inputSmCls} /></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Add new product ── */}
          {!showAddItem ? (
            <button
              type="button"
              onClick={() => setShowAddItem(true)}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 font-medium py-1 transition"
            >
              <Plus size={14} /> Agregar producto
            </button>
          ) : (
            <div className="border border-primary-200 rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-primary-50 border-b border-primary-100">
                <p className="text-sm font-semibold text-primary-800">Nuevo producto</p>
                <button
                  type="button"
                  onClick={() => { setShowAddItem(false); setNewItem(emptyNewItem()); setProductSearch(''); setProductSearchLabel(''); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Product search */}
                <div className="relative">
                  <FieldLabel>Producto</FieldLabel>
                  <input
                    type="text"
                    value={productSearchLabel || productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setProductSearchLabel('');
                      setNewItem(prev => ({ ...prev, productId: '', lotNumber: '', expirationDate: '' }));
                      setShowProductResults(true);
                    }}
                    onFocus={() => { if (!newItem.productId) setShowProductResults(true); }}
                    onBlur={() => setTimeout(() => setShowProductResults(false), 150)}
                    className={inputCls}
                    placeholder="Escribe 2+ letras para buscar..."
                    autoComplete="off"
                  />
                  {showProductResults && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {productSearch.length < 2 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Escribe al menos 2 letras...</div>
                      ) : productResultsLoading ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Buscando...</div>
                      ) : productResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
                      ) : productResults.map((p: any) => {
                        const alreadyIn = (purchase?.items ?? []).some((i: any) => i.productId === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => {
                              updateNewItem('productId', p.id);
                              setProductSearchLabel(p.name);
                              setProductSearch('');
                              setShowProductResults(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50"
                          >
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-gray-400 flex items-center gap-2">
                              {p.category?.name && <span>{p.category.name}</span>}
                              {alreadyIn && <span className="text-amber-600 font-medium">ya en la compra — edítalo arriba</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quantity + lot */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <FieldLabel>Cantidad</FieldLabel>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={newItem.quantity || ''}
                      onChange={e => updateNewItem('quantity', parseFloat(e.target.value) || 0)}
                      className={inputCls}
                      placeholder="0"
                    />
                  </div>
                  {selectedNewProduct?.tracksLot && (
                    <>
                      <div className="col-span-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center justify-between">
                          <span>Lote <span className="text-red-500">*</span></span>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
                              updateNewItem('lotNumber', `L-${stamp}-01`);
                            }}
                            className="text-gray-400 hover:text-primary-600"
                            title="Generar lote"
                          >
                            <Dices size={11} />
                          </button>
                        </label>
                        <input
                          type="text"
                          value={newItem.lotNumber || ''}
                          onChange={e => updateNewItem('lotNumber', e.target.value)}
                          placeholder="L-20260415-01"
                          className={`${inputCls} ${selectedNewProduct?.tracksLot && !newItem.lotNumber ? 'border-red-300 bg-red-50' : ''}`}
                        />
                      </div>
                      <div className="col-span-4">
                        <FieldLabel>Vencimiento</FieldLabel>
                        <input
                          type="date"
                          value={newItem.expirationDate || ''}
                          onChange={e => updateNewItem('expirationDate', e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Invoice prices block */}
                <div className={`border rounded-xl p-4 ${isUsdPurchase ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${isUsdPurchase ? 'text-blue-700' : 'text-gray-700'}`}>
                      {isUsdPurchase ? <DollarSign size={13} /> : null}
                      {isUsdPurchase ? 'Precio en factura (USD)' : 'Precio en factura (S/)'}
                    </span>
                    {isUsdPurchase && tc > 0 && (
                      <span className="text-xs font-medium text-blue-600 bg-white border border-blue-200 px-2.5 py-0.5 rounded-full">
                        T.C. S/ {tc.toFixed(4)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">P.U. sin IGV</label>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isUsdPurchase ? 'text-blue-600' : 'text-gray-500'}`}>
                          {isUsdPurchase ? '$' : 'S/'}
                        </span>
                        <input
                          type="number" min="0" step="0.01"
                          value={newItem.unitPriceSinIgv || ''}
                          onChange={e => updateNewItem('unitPriceSinIgv', parseFloat(e.target.value) || 0)}
                          className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 ${isUsdPurchase ? 'border-blue-200 focus:ring-blue-100 focus:border-blue-400' : 'border-gray-200 focus:ring-gray-100 focus:border-gray-400'}`}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      {(() => {
                        const isExempt = newItem.taxType === 'INAFECTO' || newItem.taxType === 'EXONERADO';
                        return (
                          <>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">
                              {isExempt
                                ? <span className="text-amber-600">{newItem.taxType === 'INAFECTO' ? 'Inafecto (sin IGV)' : 'Exonerado (sin IGV)'}</span>
                                : 'P.U. con IGV (18%)'}
                            </label>
                            <div className="relative">
                              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isUsdPurchase ? 'text-blue-600' : 'text-gray-500'}`}>
                                {isUsdPurchase ? '$' : 'S/'}
                              </span>
                              <input
                                type="text" readOnly
                                value={newItem.unitPriceConIgv ? newItem.unitPriceConIgv.toFixed(2) : '0.00'}
                                className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm font-semibold ${isExempt ? 'border-amber-200 bg-amber-50 text-amber-800' : isUsdPurchase ? 'border-blue-200 bg-blue-100 text-blue-800' : 'border-gray-200 bg-gray-100 text-gray-800'}`}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Flete + Otros + Costo Adquisición */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Flete</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">S/</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={newItem.flete || ''}
                        onChange={e => updateNewItem('flete', parseFloat(e.target.value) || 0)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Otros costos</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">S/</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={newItem.otrosCostos || ''}
                        onChange={e => updateNewItem('otrosCostos', parseFloat(e.target.value) || 0)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-green-700 mb-1.5">Costo Adquisición</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 text-xs font-bold">S/</span>
                      <input
                        type="text" readOnly
                        value={newItem.costoAdquisicion ? newItem.costoAdquisicion.toFixed(2) : '0.00'}
                        className="w-full pl-9 pr-3 py-2 border border-green-300 rounded-lg text-sm bg-green-50 text-green-800 font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* USD conversion formula */}
                {isUsdPurchase && tc > 0 && newItem.unitPriceConIgv > 0 && (
                  <div className="text-xs text-blue-500 bg-blue-50 px-3 py-2 rounded-lg">
                    $ {newItem.unitPriceConIgv.toFixed(2)} × {tc.toFixed(4)} = S/ {(newItem.unitPriceConIgv * tc).toFixed(2)}
                    {(newItem.flete + newItem.otrosCostos) > 0 && <> + S/ {(newItem.flete + newItem.otrosCostos).toFixed(2)} (flete/otros)</>}
                    {' '}→ <span className="font-semibold text-green-700">S/ {newItem.costoAdquisicion.toFixed(2)}</span>
                  </div>
                )}

                {/* Precios de venta */}
                {(() => {
                  const floorPrice = newItem.costoAdquisicion > 0 ? Math.round(newItem.costoAdquisicion * (1 + newItem.minMarginPercent / 100) * 100) / 100 : 0;
                  const utilidad = newItem.precioVenta > 0 ? Math.round((newItem.precioVenta * 0.985 - newItem.costoAdquisicion) * 100) / 100 : 0;
                  const utilidadMinorista = newItem.precioMinorista > 0 ? Math.round((newItem.precioMinorista * 0.985 - newItem.costoAdquisicion) * 100) / 100 : 0;
                  const utilidadEspecial = newItem.precioEspecial > 0 ? Math.round((newItem.precioEspecial * 0.985 - newItem.costoAdquisicion) * 100) / 100 : 0;
                  const bfVenta = floorPrice > 0 && newItem.precioVenta > 0 && newItem.precioVenta < floorPrice;
                  const bfMinorista = floorPrice > 0 && newItem.precioMinorista > 0 && newItem.precioMinorista < floorPrice;
                  const bfEspecial = floorPrice > 0 && newItem.precioEspecial > 0 && newItem.precioEspecial < floorPrice;
                  return (
                    <div className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-xs font-semibold text-gray-500">Precios de venta (S/)</span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-xs text-gray-500">
                            Margen mínimo
                            <input type="number" min="0" step="0.01" value={newItem.minMarginPercent} onChange={e => updateNewItem('minMarginPercent', parseFloat(e.target.value) || 0)} className="w-16 px-2 py-1 border border-gray-200 rounded text-right" />%
                          </label>
                          {floorPrice > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(bfVenta || bfMinorista || bfEspecial) ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-500'}`}>
                              Piso: S/ {floorPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-1">
                        <span className="text-[11px] font-medium text-gray-400 text-center">% Margen</span>
                        <span className="text-[11px] font-medium text-gray-400 text-center">Precio / und</span>
                        <span className="text-[11px] font-medium text-gray-400 text-center">Utilidad / und</span>
                      </div>

                      <div className="space-y-2">
                        {/* Tier 0 */}
                        <div className="grid grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5 flex items-center justify-between">
                              <span>{tierLabel(0)}</span>
                              {newItem.precioVentaMode === 'direct' && <span className="text-[10px] text-blue-500 font-medium">calculado</span>}
                            </label>
                            <input
                              type="number" min="0" step="0.01"
                              value={newItem.markupPercent || ''}
                              onChange={e => updateNewItem('markupPercent', parseFloat(e.target.value) || 0)}
                              className={`w-full px-3 py-2 border rounded-lg text-sm ${newItem.precioVentaMode === 'direct' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`}
                              placeholder="20"
                            />
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={newItem.precioVenta || ''}
                                onChange={e => updateNewItem('precioVenta', parseFloat(e.target.value) || 0)}
                                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${bfVenta ? 'border-red-400 bg-red-50 text-red-700' : newItem.precioVentaMode === 'markup' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`}
                                placeholder="0.00"
                              />
                            </div>
                            {bfVenta && <p className="text-[10px] text-red-600 mt-0.5">Menor al precio piso</p>}
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                              <input type="text" readOnly
                                value={newItem.precioVenta > 0 ? utilidad.toFixed(2) : '—'}
                                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-semibold ${newItem.precioVenta > 0 ? (utilidad >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700') : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Tier 1 */}
                        <div className="grid grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5 flex items-center justify-between">
                              <span>{tierLabel(1)}</span>
                              {newItem.precioMinoristaMode === 'direct' && <span className="text-[10px] text-blue-500 font-medium">calculado</span>}
                            </label>
                            <input
                              type="number" min="0" step="0.01"
                              value={newItem.markupMinoristaPercent || ''}
                              onChange={e => updateNewItem('markupMinoristaPercent', parseFloat(e.target.value) || 0)}
                              className={`w-full px-3 py-2 border rounded-lg text-sm ${newItem.precioMinoristaMode === 'direct' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`}
                              placeholder="15"
                            />
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={newItem.precioMinorista || ''}
                                onChange={e => updateNewItem('precioMinorista', parseFloat(e.target.value) || 0)}
                                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${bfMinorista ? 'border-red-400 bg-red-50 text-red-700' : newItem.precioMinoristaMode === 'markup' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`}
                                placeholder="0.00"
                              />
                            </div>
                            {bfMinorista && <p className="text-[10px] text-red-600 mt-0.5">Menor al precio piso</p>}
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                              <input type="text" readOnly
                                value={newItem.precioMinorista > 0 ? utilidadMinorista.toFixed(2) : '—'}
                                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-semibold ${newItem.precioMinorista > 0 ? (utilidadMinorista >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700') : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Tier 2 */}
                        <div className="grid grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5 flex items-center justify-between">
                              <span>{tierLabel(2)}</span>
                              {newItem.precioEspecialMode === 'direct' && <span className="text-[10px] text-blue-500 font-medium">calculado</span>}
                            </label>
                            <input
                              type="number" min="0" step="0.01"
                              value={newItem.markupEspecialPercent || ''}
                              onChange={e => updateNewItem('markupEspecialPercent', parseFloat(e.target.value) || 0)}
                              className={`w-full px-3 py-2 border rounded-lg text-sm ${newItem.precioEspecialMode === 'direct' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`}
                              placeholder="10"
                            />
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={newItem.precioEspecial || ''}
                                onChange={e => updateNewItem('precioEspecial', parseFloat(e.target.value) || 0)}
                                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${bfEspecial ? 'border-red-400 bg-red-50 text-red-700' : newItem.precioEspecialMode === 'markup' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200'}`}
                                placeholder="0.00"
                              />
                            </div>
                            {bfEspecial && <p className="text-[10px] text-red-600 mt-0.5">Menor al precio piso</p>}
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">S/</span>
                              <input type="text" readOnly
                                value={newItem.precioEspecial > 0 ? utilidadEspecial.toFixed(2) : '—'}
                                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm font-semibold ${newItem.precioEspecial > 0 ? (utilidadEspecial >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700') : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Utilidad estimada × cantidad */}
                      {newItem.quantity > 0 && newItem.costoAdquisicion > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center flex-wrap gap-x-4 gap-y-1 justify-between">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="font-medium text-gray-400">Utilidad Estimada:</span>
                            {newItem.precioVenta > 0 && <span>{tierLabel(0)}: <span className={`font-semibold ${utilidad * newItem.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>S/ {(utilidad * newItem.quantity).toFixed(2)}</span></span>}
                            {newItem.precioMinorista > 0 && <span>{tierLabel(1)}: <span className={`font-semibold ${utilidadMinorista * newItem.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>S/ {(utilidadMinorista * newItem.quantity).toFixed(2)}</span></span>}
                            {newItem.precioEspecial > 0 && <span>{tierLabel(2)}: <span className={`font-semibold ${utilidadEspecial * newItem.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>S/ {(utilidadEspecial * newItem.quantity).toFixed(2)}</span></span>}
                          </div>
                          <span className="ml-auto text-xs text-gray-500">Subtotal: <span className="font-semibold text-gray-700">S/ {(newItem.quantity * newItem.costoAdquisicion).toFixed(2)}</span></span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {(purchase as any).isHistorical && (
                  <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1.5">
                    Factura histórica — el producto se registrará sin afectar el stock.
                  </p>
                )}
                {!((purchase as any).isHistorical) && purchase.receptionStatus === 'RECEIVED' && (
                  <p className="text-xs text-primary-700 bg-primary-100 rounded px-2 py-1.5">
                    La compra ya fue recibida — el stock se actualizará automáticamente al agregar.
                  </p>
                )}
                {!((purchase as any).isHistorical) && purchase.receptionStatus !== 'RECEIVED' && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                    El producto se agregará a la compra para recibirlo más adelante.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddItem(false); setNewItem(emptyNewItem()); setProductSearch(''); setProductSearchLabel(''); }}
                    className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={editItems.isPending}
                    className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
                  >
                    {editItems.isPending ? 'Agregando...' : 'Agregar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Bonificaciones section ── */}
        <SectionCard title={`Bonificaciones${((purchase as any).bonificationItems?.length ?? 0) > 0 ? ` (${(purchase as any).bonificationItems.length})` : ''}`} icon={Gift} iconClassName="text-purple-600">
          <div className="mb-3 flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-700">
            <Gift size={12} className="flex-shrink-0 mt-0.5" />
            <span>Productos recibidos como bonificación — aumentan el stock pero <strong>no afectan el precio</strong> de la compra.</span>
          </div>

          {((purchase as any).bonificationItems?.length ?? 0) > 0 && (
            <div className="space-y-2 mb-3">
              {((purchase as any).bonificationItems ?? []).map((bonif: any, idx: number) => {
                const bp = products.find((p) => p.id === bonif.productId);
                return (
                  <div key={idx} className="border border-purple-100 rounded-lg p-3 bg-purple-50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-purple-800">{bonif.productName || bp?.name || bonif.productId}</p>
                        <div className="flex flex-wrap gap-x-3 text-xs text-purple-600 mt-0.5">
                          <span>Cant: <b>{bonif.quantity}</b></span>
                          {bonif.lotNumber && <span>Lote: <b>{bonif.lotNumber}</b></span>}
                          {bonif.expirationDate && <span>Vence: <b>{toInputDate(bonif.expirationDate)}</b></span>}
                        </div>
                      </div>
                      <span className="text-[10px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded font-medium shrink-0">BONIF</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!showAddBonif ? (
            <button
              type="button"
              onClick={() => setShowAddBonif(true)}
              className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 font-medium py-1 transition"
            >
              <Gift size={14} /> Agregar bonificación
            </button>
          ) : (
            <div className="border border-purple-200 rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
                <p className="text-sm font-semibold text-purple-800 flex items-center gap-2"><Gift size={14} /> Nueva bonificación</p>
                <button type="button" onClick={() => { setShowAddBonif(false); setNewBonif({ productId: '', quantity: 0, lotNumber: '', expirationDate: '' }); setBonifSearch(''); setBonifSearchLabel(''); }} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="relative">
                  <FieldLabel>Producto</FieldLabel>
                  <input
                    type="text"
                    value={bonifSearchLabel || bonifSearch}
                    onChange={(e) => { setBonifSearch(e.target.value); setBonifSearchLabel(''); setNewBonif(prev => ({ ...prev, productId: '', lotNumber: '', expirationDate: '' })); setShowBonifResults(true); }}
                    onFocus={() => { if (!newBonif.productId) setShowBonifResults(true); }}
                    onBlur={() => setTimeout(() => setShowBonifResults(false), 150)}
                    className={inputCls}
                    placeholder="Escribe 2+ letras para buscar..."
                    autoComplete="off"
                  />
                  {showBonifResults && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {bonifSearch.length < 2 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Escribe al menos 2 letras...</div>
                      ) : bonifResultsLoading ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Buscando...</div>
                      ) : bonifResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
                      ) : bonifResults.map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => { setNewBonif(prev => ({ ...prev, productId: p.id })); setBonifSearchLabel(p.name); setBonifSearch(''); setShowBonifResults(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50"
                        >
                          <div className="font-medium">{p.name}</div>
                          {p.category?.name && <div className="text-xs text-gray-400">{p.category.name}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <FieldLabel>Cantidad</FieldLabel>
                    <input type="number" min="0.01" step="0.01" value={newBonif.quantity || ''} onChange={(e) => setNewBonif(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))} className={inputCls} placeholder="0" />
                  </div>
                  <div>
                    <FieldLabel>Lote</FieldLabel>
                    <div className="flex gap-1">
                      <input type="text" value={newBonif.lotNumber} onChange={(e) => setNewBonif(prev => ({ ...prev, lotNumber: e.target.value }))} className={inputCls} placeholder="Opcional" />
                      <button type="button" onClick={() => { const d = new Date(); const s = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; setNewBonif(prev => ({ ...prev, lotNumber: `L-${s}-01` })); }} className="px-2 text-gray-400 hover:text-purple-600 border border-gray-200 rounded-lg" title="Generar lote"><Dices size={14} /></button>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Vencimiento</FieldLabel>
                    <input type="date" value={newBonif.expirationDate} onChange={(e) => setNewBonif(prev => ({ ...prev, expirationDate: e.target.value }))} className={inputCls} />
                  </div>
                </div>

                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1.5">
                  {(purchase as any).isHistorical
                    ? 'Factura histórica — la bonificación se registrará sin afectar el stock.'
                    : purchase.receptionStatus === 'RECEIVED'
                    ? 'La compra ya fue recibida — el stock de la bonificación se actualizará automáticamente.'
                    : 'La bonificación se agregará para recibirla junto con los productos.'}
                </p>

                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowAddBonif(false); setNewBonif({ productId: '', quantity: 0, lotNumber: '', expirationDate: '' }); setBonifSearch(''); setBonifSearchLabel(''); }} className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button type="button" onClick={handleAddBonif} disabled={editItems.isPending} className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50">
                    {editItems.isPending ? 'Agregando...' : 'Agregar bonificación'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
