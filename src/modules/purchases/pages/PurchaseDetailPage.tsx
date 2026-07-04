import { useState, useRef } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { usePurchase, useRegisterReception, usePurchaseAccountPayable, useDeletePurchase } from '../hooks/usePurchases';
import { useUploadVoucher } from '../../accounts-payable/hooks/useAccountsPayable';
import { ImageModal } from '../../../shared/components/ImageModal';
import { Modal } from '../../../shared/components/Modal';
import { useAuth } from '../../../app/providers/AuthProvider';
import { ArrowLeft, ShoppingCart, Building2, CreditCard, Package, PackageCheck, Clock, CheckCircle2, AlertCircle, X, FileText, Calendar, Camera, ImageIcon, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import type { Purchase, PurchaseItem, PurchaseReception, PurchaseReceptionItem, PurchaseReceptionStatus, AccountPayable } from '../../../shared/types';

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <span className="text-sm font-medium text-gray-800">{children}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, extra }: { title: string; icon: any; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-primary-600" />
          <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        </div>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const STATUS_CONFIG: Record<PurchaseReceptionStatus, { label: string; icon: any; cls: string }> = {
  PENDING:  { label: 'Pendiente de recepción', icon: Clock,         cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  PARTIAL:  { label: 'Recepción parcial',       icon: AlertCircle,  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  RECEIVED: { label: 'Recibido completo',        icon: CheckCircle2, cls: 'bg-green-100 text-green-800 border-green-200' },
};

function dueDateInfo(dateStr: string): { label: string; cls: string } {
  const stored = new Date(dateStr);
  const today = new Date();
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const storedMs = Date.UTC(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate());
  const days = Math.ceil((storedMs - todayMs) / 86400000);
  if (days < 0) return { label: `Vencida hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}`, cls: 'text-red-600 font-semibold' };
  if (days === 0) return { label: 'Vence hoy', cls: 'text-red-600 font-semibold' };
  if (days <= 3) return { label: `Vence en ${days} día${days !== 1 ? 's' : ''}`, cls: 'text-orange-600 font-medium' };
  return { label: `Vence en ${days} días`, cls: 'text-gray-600' };
}

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const backTo: string = (location.state as any)?.from || '/purchases';
  const { data: purchase, isLoading } = usePurchase(id!);
  const { data: accountPayable } = usePurchaseAccountPayable(id!);
  const registerReception = useRegisterReception();
  const deletePurchase = useDeletePurchase();
  const uploadVoucher = useUploadVoucher();
  const voucherInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const compressImage = (file: File): Promise<File> => new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const safeName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      canvas.toBlob(blob => resolve(new File([blob!], safeName, { type: 'image/jpeg' })), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

  const openModal = (p: Purchase) => {
    const initial: Record<string, number> = {};
    p.items.forEach(item => {
      const pending = item.quantity - (item.receivedQty || 0);
      if (pending > 0) initial[item.productId] = pending;
    });
    setQuantities(initial);
    setNotes('');
    setShowModal(true);
  };

  const handleReceive = async (p: Purchase) => {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    if (items.length === 0) return;
    await registerReception.mutateAsync({ id: p.id, data: { items, notes: notes.trim() || undefined } });
    setShowModal(false);
  };

  const handleDelete = async () => {
    await deletePurchase.mutateAsync(id!);
    navigate(backTo, { replace: true });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  }

  if (!purchase) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Link to={backTo} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><ArrowLeft size={18} /></Link>
          <h1 className="text-2xl font-bold text-gray-800">Compra no encontrada</h1>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">La compra que buscas no existe o fue eliminada.</p>
          <Link to={backTo} className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Volver a compras</Link>
        </div>
      </div>
    );
  }

  const status = (purchase.receptionStatus ?? (purchase.isHistorical ? 'RECEIVED' : 'PENDING')) as PurchaseReceptionStatus;
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;
  const sym = purchase.totalCostUsd ? '$' : 'S/';
  const canReceive = status !== 'RECEIVED';
  const isCredit = purchase.paymentType === 'CREDITO';
  const ap: AccountPayable | undefined = accountPayable || undefined;
  const installments = ap?.installments || [];
  const dueDate: string | undefined = ap?.dueDate || (purchase as any).dueDate;
  const paymentScheduleType: string | undefined = ap?.paymentScheduleType || (purchase as any).paymentScheduleType;
  const apCurrency: 'PEN' | 'USD' = ap?.currency || 'PEN';
  const isUsd = apCurrency === 'USD';
  const remisionGuia: any = (purchase as any).remisionGuia;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link to={backTo} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 mt-0.5 flex-shrink-0" title="Volver">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 flex items-center gap-1 mb-0.5"><ShoppingCart size={12} /> Compras</div>
          <h1 className="text-xl font-bold text-gray-800">Detalle de Compra</h1>
          {/* Status badge below title on mobile */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border mt-1.5 ${statusCfg.cls}`}>
            <StatusIcon size={12} /> {statusCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/purchases/${purchase.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <Pencil size={14} /> Editar
          </Link>
          {(user?.role === 'ADMIN' || user?.role === 'VENDEDOR') && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 shadow-sm"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Info general */}
        <SectionCard title="Información general" icon={Building2}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <InfoCell label="Fecha">{new Date(purchase.date).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' })}</InfoCell>
            <InfoCell label="Proveedor">{purchase.supplier}{purchase.supplierRuc ? ` (${purchase.supplierRuc})` : ''}</InfoCell>
            <InfoCell label="Tipo de Pago">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isCredit ? 'bg-orange-100 text-orange-700' : 'bg-primary-100 text-primary-700'}`}>
                {isCredit ? 'Crédito' : 'Contado'}
              </span>
            </InfoCell>
            {purchase.documentType && (
              <InfoCell label="Comprobante">
                {purchase.documentType} {purchase.documentSeries || ''}{purchase.documentNumber ? `-${purchase.documentNumber}` : ''}
                {purchase.issueDate && <span className="block text-xs text-gray-500 mt-0.5">Emisión: {new Date(purchase.issueDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</span>}
              </InfoCell>
            )}
            {remisionGuia && (
              <InfoCell label="Guía de Remisión">
                <span className="font-mono">{remisionGuia.serie}-{remisionGuia.correlativo}</span>
                {remisionGuia.fecha && <span className="block text-xs text-gray-500 mt-0.5">{new Date(remisionGuia.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</span>}
              </InfoCell>
            )}
            {(purchase as any).isHistorical && (
              <InfoCell label="Tipo"><span className="text-indigo-700 font-semibold">Factura histórica</span></InfoCell>
            )}
          </div>
        </SectionCard>

        {/* Condiciones de crédito */}
        {isCredit && (
          <SectionCard title="Condiciones de crédito" icon={Calendar}>
            <div className="space-y-3">
              {/* Cabecera: modalidad + resumen montos */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Modalidad:</span>
                  <span className="font-medium text-gray-800">
                    {paymentScheduleType === 'INSTALLMENTS' ? 'Pago por cuotas' : 'Fecha única de vencimiento'}
                  </span>
                </div>
                {ap && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${ap.status === 'PAID' ? 'bg-green-100 text-green-700' : ap.status === 'PARTIAL' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {ap.status === 'PAID' ? 'Pagado' : ap.status === 'PARTIAL' ? 'Pago parcial' : 'Pendiente'}
                    </span>
                    {ap.paidAmount > 0 && (
                      <span className="text-gray-500">Pagado: <span className="font-semibold text-green-700">S/ {ap.paidAmount.toFixed(2)}</span></span>
                    )}
                    {ap.pendingAmount > 0 && (
                      <span className="text-gray-500">Pendiente: <span className="font-semibold text-orange-700">S/ {ap.pendingAmount.toFixed(2)}</span></span>
                    )}
                  </div>
                )}
              </div>

              {/* Fecha única */}
              {paymentScheduleType === 'SINGLE_DATE' && dueDate && (() => {
                const isPaid = ap?.status === 'PAID';
                const info = isPaid ? null : dueDateInfo(dueDate);
                const singlePayment = isPaid ? ap?.payments?.[0] : undefined;
                const singleVoucherUrl = singlePayment?.voucherUrl;
                const singlePaymentId = singlePayment?.id;
                return (
                  <div className={`border rounded-lg px-4 py-3 ${isPaid ? 'border-green-200 bg-green-50' : info?.cls.includes('red') ? 'border-red-200 bg-red-50' : info?.cls.includes('orange') ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Fecha de vencimiento</div>
                        <div className="text-sm font-semibold text-gray-800">{new Date(dueDate).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                        {isUsd && ap && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            ${ap.totalAmount.toFixed(2)} USD ·{' '}
                            {isPaid
                              ? <span className="text-green-600 font-medium">S/ {ap.paidAmount.toFixed(2)} pagado</span>
                              : <>S/ {(ap.totalAmountPen || ap.totalAmount).toFixed(2)}{purchase.exchangeRate && <span className="ml-1 text-gray-400">(T.C. {purchase.exchangeRate.toFixed(4)})</span>}</>
                            }
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isPaid && ap?.id && singlePaymentId && (
                          <>
                            {singleVoucherUrl
                              ? <button type="button" onClick={() => setLightboxUrl(singleVoucherUrl)} title="Ver voucher" className="p-1.5 rounded-lg hover:bg-green-200 transition-colors">
                                  <ImageIcon size={15} className="text-green-600" />
                                </button>
                              : <span className="p-1.5 rounded-lg opacity-30" title="Sin voucher"><ImageIcon size={15} className="text-gray-400" /></span>
                            }
                            <label title="Cámara" className="p-1.5 rounded-lg hover:bg-green-200 transition-colors cursor-pointer">
                              <Camera size={15} className={singleVoucherUrl ? 'text-green-600' : 'text-gray-400'} />
                              <input type="file" accept="image/*" capture="environment" className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (file) { const compressed = await compressImage(file); uploadVoucher.mutate({ apId: ap.id, paymentId: singlePaymentId, file: compressed }); }
                                  e.target.value = '';
                                }} />
                            </label>
                            <label title="Galería" className="p-1.5 rounded-lg hover:bg-green-200 transition-colors cursor-pointer">
                              <FolderOpen size={15} className={singleVoucherUrl ? 'text-green-600' : 'text-gray-400'} />
                              <input type="file" accept="image/*" className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (file) { const compressed = await compressImage(file); uploadVoucher.mutate({ apId: ap.id, paymentId: singlePaymentId, file: compressed }); }
                                  e.target.value = '';
                                }} />
                            </label>
                          </>
                        )}
                        {isPaid
                          ? <span className="text-sm font-semibold text-green-700">✓ Pagada</span>
                          : <span className={`text-sm font-medium ${info?.cls}`}>{info?.label}</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Cuotas */}
              {paymentScheduleType === 'INSTALLMENTS' && installments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Cuotas ({installments.length})
                    {isUsd && <span className="ml-1 font-normal normal-case text-gray-400">· montos en USD</span>}
                  </div>
                  {installments.map((inst: any, i: number) => {
                    const isPaid = inst.status === 'PAID';
                    const info = inst.dueDate && !isPaid ? dueDateInfo(inst.dueDate) : null;
                    const paidInstIndex = installments.slice(0, i).filter((x: any) => x.status === 'PAID').length;
                    const correspondingPayment = isPaid ? ap?.payments?.[paidInstIndex] : undefined;
                    const paidPen: number | null = inst.paidAmountPen ?? (isPaid && isUsd && correspondingPayment ? correspondingPayment.amount : null);
                    const voucherUrl = correspondingPayment?.voucherUrl;
                    const paymentId = correspondingPayment?.id;
                    const inputKey = `inst-${i}`;
                    return (
                      <div key={i} className={`rounded-lg border px-3 py-2.5 ${isPaid ? 'bg-green-50 border-green-200' : info?.cls.includes('red') ? 'bg-red-50 border-red-200' : info?.cls.includes('orange') ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${isPaid ? 'bg-green-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
                            {isPaid ? '✓' : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700">
                              {isPaid
                                ? `Pagada el ${inst.paidDate ? new Date(inst.paidDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}`
                                : inst.dueDate ? `Vence: ${new Date(inst.dueDate).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })}` : '—'}
                            </div>
                            {info && <div className={`text-[11px] mt-0.5 ${info.cls}`}>{info.label}</div>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Voucher icons — only for paid installments */}
                            {isPaid && ap?.id && paymentId && (
                              <>
                                {voucherUrl
                                  ? <button type="button" onClick={() => setLightboxUrl(voucherUrl)} title="Ver voucher" className="p-1 rounded hover:bg-green-200 transition-colors">
                                      <ImageIcon size={14} className="text-green-600" />
                                    </button>
                                  : <span className="p-1 rounded opacity-30" title="Sin voucher"><ImageIcon size={14} className="text-gray-400" /></span>
                                }
                                <label title="Cámara" className="p-1 rounded hover:bg-green-200 transition-colors cursor-pointer">
                                  <Camera size={14} className={voucherUrl ? 'text-green-600' : 'text-gray-400'} />
                                  <input type="file" accept="image/*" capture="environment" className="hidden"
                                    onChange={async e => {
                                      const file = e.target.files?.[0];
                                      if (file) { const compressed = await compressImage(file); uploadVoucher.mutate({ apId: ap.id, paymentId, file: compressed }); }
                                      e.target.value = '';
                                    }} />
                                </label>
                                <label title="Galería" className="p-1 rounded hover:bg-green-200 transition-colors cursor-pointer">
                                  <FolderOpen size={14} className={voucherUrl ? 'text-green-600' : 'text-gray-400'} />
                                  <input type="file" accept="image/*" className="hidden"
                                    ref={el => { voucherInputRefs.current[inputKey] = el; }}
                                    onChange={async e => {
                                      const file = e.target.files?.[0];
                                      if (file) { const compressed = await compressImage(file); uploadVoucher.mutate({ apId: ap.id, paymentId, file: compressed }); }
                                      e.target.value = '';
                                    }} />
                                </label>
                              </>
                            )}
                            {/* Amount */}
                            <div className="text-right">
                              <div className="font-semibold text-sm text-gray-800">
                                {isUsd ? `$ ${inst.amount.toFixed(2)}` : `S/ ${inst.amount.toFixed(2)}`}
                              </div>
                              {isPaid && isUsd && paidPen != null && (
                                <div className="text-[11px] text-green-600 mt-0.5">S/ {paidPen.toFixed(2)}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sin datos de cuotas */}
              {paymentScheduleType === 'INSTALLMENTS' && installments.length === 0 && !ap && (
                <p className="text-xs text-gray-400 italic">Cargando información de cuotas...</p>
              )}
            </div>
          </SectionCard>
        )}

        {/* Productos */}
        <SectionCard
          title={`Productos (${purchase.items.length})`}
          icon={Package}
          extra={canReceive && (
            <button onClick={() => openModal(purchase)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700">
              <PackageCheck size={14} /> Registrar recepción
            </button>
          )}
        >
          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {purchase.items.map((item: PurchaseItem, idx: number) => {
              const received = purchase.isHistorical ? item.quantity : (item.receivedQty || 0);
              const pending = item.quantity - received;
              return (
                <div key={idx} className={`rounded-lg border p-3 ${pending > 0 ? 'bg-yellow-50/60 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-gray-800 text-sm leading-snug">{item.productName || item.productId}</span>
                    <span className="font-bold text-sm text-gray-800 flex-shrink-0">{sym} {(item.quantity * (item.unitCost || 0)).toFixed(2)}</span>
                  </div>
                  {/* Reception status */}
                  <div className="flex items-center gap-3 text-xs mb-2 flex-wrap">
                    <span className="text-gray-500">Pedido: <span className="font-semibold text-gray-700">{item.quantity}</span></span>
                    <span className="text-green-600">Recibido: <span className="font-semibold">{received}</span></span>
                    {pending > 0
                      ? <span className="text-orange-600 flex items-center gap-0.5"><Clock size={10} /> Pendiente: <span className="font-semibold ml-0.5">{pending}</span></span>
                      : <span className="text-green-600 font-semibold">✓ Completo</span>}
                  </div>
                  {/* Lot info */}
                  {(item.lotNumber || item.expirationDate) && (
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                      {item.lotNumber && <span>Lote: <span className="font-mono font-medium text-gray-700">{item.lotNumber}</span></span>}
                      {item.expirationDate && <span>Vence: <span className="font-medium text-gray-700">{new Date(item.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</span></span>}
                    </div>
                  )}
                  {/* Prices */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap border-t border-gray-200 pt-2 mt-1">
                    {item.unitPriceSinIgv ? <span>P.U. s/IGV: <span className="font-medium text-gray-700">{sym} {item.unitPriceSinIgv.toFixed(2)}</span></span> : null}
                    <span>C.Adq: <span className="font-semibold text-green-700">{sym} {(item.unitCost || 0).toFixed(2)}</span></span>
                    {item.precioVenta ? <span>P.Venta: <span className="font-medium text-gray-700">{sym} {item.precioVenta.toFixed(2)}</span></span> : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block border rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Producto</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Pedido</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Recibido</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Pendiente</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Lote</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Vence</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">P.U. s/IGV</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">C. Adq.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">P. Venta</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchase.items.map((item: PurchaseItem, idx: number) => {
                  const received = purchase.isHistorical ? item.quantity : (item.receivedQty || 0);
                  const pending = item.quantity - received;
                  return (
                    <tr key={idx} className={pending > 0 ? 'bg-yellow-50/40' : ''}>
                      <td className="px-3 py-2 font-medium">{item.productName || item.productId}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right"><span className={received > 0 ? 'text-green-700 font-semibold' : 'text-gray-400'}>{received}</span></td>
                      <td className="px-3 py-2 text-right">{pending > 0 ? <span className="inline-flex items-center gap-1 text-orange-600 font-semibold"><Clock size={11} />{pending}</span> : <span className="text-green-600 font-semibold">✓</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{item.lotNumber || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{item.expirationDate ? new Date(item.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '—'}</td>
                      <td className="px-3 py-2 text-right">{item.unitPriceSinIgv ? `${sym} ${item.unitPriceSinIgv.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">{sym} {(item.unitCost || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{item.precioVenta ? `${sym} ${item.precioVenta.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{sym} {(item.quantity * (item.unitCost || 0)).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Historial de recepciones */}
        {purchase.receptions && purchase.receptions.length > 0 && (
          <SectionCard title={`Historial de recepciones (${purchase.receptions.length})`} icon={PackageCheck}>
            <div className="space-y-3">
              {purchase.receptions.map((r: PurchaseReception, idx: number) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                    <span className="text-sm font-semibold text-gray-700">Recepción #{idx + 1}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {r.receivedByName && <span>por {r.receivedByName}</span>}
                      <span>{new Date(r.date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                  {r.notes && <p className="text-xs text-gray-500 mb-2 italic">"{r.notes}"</p>}
                  <div className="flex flex-wrap gap-2">
                    {r.items.map((ri: PurchaseReceptionItem, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs">
                        <span className="font-semibold text-primary-700">{ri.quantity}×</span>
                        <span className="text-gray-700">{ri.productName || ri.productId}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Totales */}
        <SectionCard title="Totales" icon={CreditCard}>
          <div className="space-y-2">
            {purchase.totalCostUsd && purchase.exchangeRate && (
              <div className="bg-primary-50 p-3 rounded-lg space-y-1 border border-primary-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-primary-700">Monto USD</span>
                  <span className="text-lg font-bold text-primary-800">$ {purchase.totalCostUsd.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-primary-600">
                  <span>Tipo de cambio (venta)</span>
                  <span>S/ {purchase.exchangeRate.toFixed(4)}</span>
                </div>
              </div>
            )}
            <div className="bg-blue-50 p-3 rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">Total en Soles</span>
              <span className="text-xl font-bold text-blue-700">S/ {purchase.totalCost.toFixed(2)}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Modal de recepción */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><PackageCheck size={18} /> Registrar Recepción</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-sm text-gray-500">Indica cuántas unidades llegaron de cada producto. Puedes dejar en 0 los que aún no llegaron.</p>
              <div className="space-y-3">
                {purchase.items.filter((item: PurchaseItem) => (item.quantity - (item.receivedQty || 0)) > 0).map((item: PurchaseItem) => {
                  const pending = item.quantity - (item.receivedQty || 0);
                  return (
                    <div key={item.productId} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-800">{item.productName || item.productId}</span>
                        <span className="text-xs text-orange-600 font-medium">Pendiente: {pending}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-500 shrink-0">Cantidad recibida:</label>
                        <input
                          type="number" min={0} max={pending} step="0.01"
                          value={quantities[item.productId] ?? pending}
                          onChange={(e) => setQuantities(prev => ({ ...prev, [item.productId]: parseFloat(e.target.value) || 0 }))}
                          className="flex-1 px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ej: Llegaron en buen estado, faltó 1 saco..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => handleReceive(purchase)}
                disabled={registerReception.isPending || Object.values(quantities).every(q => q <= 0)}
                className="w-full py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 font-semibold transition-colors"
              >
                {registerReception.isPending ? 'Registrando...' : 'Confirmar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Modal isOpen={showDeleteModal} onClose={() => !deletePurchase.isPending && setShowDeleteModal(false)} title="Eliminar compra">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <p className="font-semibold">¿Estás seguro de eliminar esta compra?</p>
            <p className="mt-1">Esta acción no se puede deshacer.</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
            <p className="font-medium text-gray-800 mb-2">Al eliminar la compra también se eliminará:</p>
            <ul className="space-y-2 list-disc pl-5">
              <li>Stock de productos comprados</li>
              <li>Cuentas por pagar</li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">El stock nunca quedará en negativo; como mínimo quedará en 0.</p>
          </div>
          <div className="text-sm bg-white border border-gray-200 rounded-xl p-3">
            <div>Proveedor: <span className="font-medium">{purchase.supplier}</span></div>
            <div>Total: <span className="font-medium">{sym} {(purchase.totalCostUsd || purchase.totalCost).toFixed(2)}</span></div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              disabled={deletePurchase.isPending}
              className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePurchase.isPending}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deletePurchase.isPending ? 'Eliminando...' : 'Eliminar compra'}
            </button>
          </div>
        </div>
      </Modal>
      <ImageModal url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
