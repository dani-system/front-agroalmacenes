import { useRef, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { usePaymentAgreementById, useUploadAgreementVoucher, useUploadInstallmentVoucher } from '../hooks/usePaymentAgreements';
import { ImageModal } from '../../../shared/components/ImageModal';
import {
  ArrowLeft, ClipboardList, CheckCircle, AlertCircle, Hash,
  Camera, ImageIcon, Eye, FileText, Calendar, CreditCard,
} from 'lucide-react';
import type { PaymentAgreement, AgreementInstallment } from '../../../shared/types';

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <span className="text-sm font-medium text-gray-800">{children}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon size={16} className="text-primary-600" />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const agStatusLabels: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'Pendiente',  cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  PARTIAL:   { label: 'Parcial',    cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  PAID:      { label: 'Pagado',     cls: 'bg-green-100 text-green-800 border-green-200' },
  CANCELLED: { label: 'Anulado',    cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const voucherBadge = (t: string) =>
  t === 'BOLETA' ? 'bg-primary-100 text-primary-800' : 'bg-blue-100 text-blue-800';

function instColor(inst: AgreementInstallment): 'green' | 'red' | 'yellow' | 'blue' {
  if (inst.status === 'PAID') return 'green';
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const dueMs = new Date(inst.dueDate.slice(0, 10) + 'T00:00:00').getTime();
  if (dueMs < todayMs) return 'red';
  return Math.ceil((dueMs - todayMs) / 86400000) <= 3 ? 'yellow' : 'blue';
}
const instColorMap = {
  green:  { row: 'bg-green-50',  circle: 'bg-green-500 text-white',           date: 'text-green-700',              badge: 'bg-green-100 text-green-700' },
  red:    { row: 'bg-red-50',    circle: 'bg-red-100 text-red-700',           date: 'text-red-700 font-semibold',  badge: 'bg-red-100 text-red-700' },
  yellow: { row: 'bg-yellow-50', circle: 'bg-yellow-100 text-yellow-700',     date: 'text-yellow-700 font-medium', badge: 'bg-yellow-100 text-yellow-700' },
  blue:   { row: '',             circle: 'bg-gray-100 text-gray-600',         date: 'text-gray-500',               badge: 'bg-blue-50 text-blue-600' },
};

function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file);
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const backTo: string = (location.state as any)?.from || '/accounts-payable';

  const { data: raw, isLoading } = usePaymentAgreementById(id!);
  const agreement = raw as PaymentAgreement | undefined;
  const uploadVoucher = useUploadAgreementVoucher();
  const uploadInstVoucher = useUploadInstallmentVoucher();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadingInstId, setUploadingInstId] = useState<string | null>(null);

  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleVoucherFile = async (file: File, paymentId: string) => {
    if (!id) return;
    setUploadingId(paymentId);
    try {
      const compressed = await compressImage(file);
      await uploadVoucher.mutateAsync({ agreementId: id, paymentId, file: compressed });
    } finally {
      setUploadingId(null);
    }
  };

  const handleInstVoucherFile = async (file: File, installmentId: string) => {
    if (!id) return;
    setUploadingInstId(installmentId);
    try {
      const compressed = await compressImage(file);
      await uploadInstVoucher.mutateAsync({ agreementId: id, installmentId, file: compressed });
    } finally {
      setUploadingInstId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Acuerdo no encontrado</p>
        <Link to={backTo} className="mt-4 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
          <ArrowLeft size={14} /> Volver
        </Link>
      </div>
    );
  }

  const sym = agreement.currency === 'USD' ? '$' : 'S/';
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const st = agStatusLabels[agreement.status] || { label: agreement.status, cls: '' };
  const progress = agreement.totalAmount > 0 ? (agreement.paidAmount / agreement.totalAmount) * 100 : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-10">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <Link to={backTo} className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-800 truncate">{agreement.supplier}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>{st.label}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Acuerdo creado el {new Date(agreement.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Amounts */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center border border-gray-100">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
            <div className="font-bold text-gray-700 text-sm mt-0.5">{sym} {agreement.totalAmount.toFixed(2)}</div>
          </div>
          <div className="bg-green-50 rounded-lg px-3 py-2.5 text-center border border-green-100">
            <div className="text-[10px] text-green-500 uppercase tracking-wide">Pagado</div>
            <div className="font-bold text-green-700 text-sm mt-0.5">{sym} {agreement.paidAmount.toFixed(2)}</div>
          </div>
          <div className="bg-red-50 rounded-lg px-3 py-2.5 text-center border border-red-100">
            <div className="text-[10px] text-red-400 uppercase tracking-wide">Pendiente</div>
            <div className="font-bold text-red-600 text-sm mt-0.5">{sym} {agreement.pendingAmount.toFixed(2)}</div>
          </div>
        </div>
        {agreement.status !== 'CANCELLED' && (
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progreso de pago</span><span>{progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Document info */}
      {(agreement.documentType || agreement.documentSeries || agreement.remisionGuia) && (
        <SectionCard title="Datos del comprobante" icon={FileText}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {agreement.documentType && <InfoCell label="Tipo">{agreement.documentType}</InfoCell>}
            {agreement.documentSeries && agreement.documentNumber && (
              <InfoCell label="Serie - Correlativo">
                <span className="font-mono">{agreement.documentSeries}-{agreement.documentNumber}</span>
              </InfoCell>
            )}
            {agreement.currency && <InfoCell label="Moneda">{agreement.currency === 'USD' ? '$ Dólares' : 'S/ Soles'}</InfoCell>}
            {agreement.remisionGuia && (
              <>
                <InfoCell label="GR Serie"><span className="font-mono">{agreement.remisionGuia.serie}</span></InfoCell>
                <InfoCell label="GR Correlativo"><span className="font-mono">{agreement.remisionGuia.correlativo}</span></InfoCell>
                <InfoCell label="GR Fecha">{agreement.remisionGuia.fecha}</InfoCell>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* Invoices */}
      <SectionCard title={`Facturas del acuerdo (${agreement.invoices.length})`} icon={ClipboardList}>
        <div className="flex flex-wrap gap-2">
          {agreement.invoices.map((inv, i) =>
            inv.purchaseId
              ? <Link key={i} to={`/purchases/${inv.purchaseId}`} state={{ from: `/agreements/${id}` }}
                  className="text-sm font-mono text-primary-600 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-lg transition-colors hover:underline underline-offset-2 border border-primary-100">
                  {inv.purchaseRef || inv.apId.slice(-6)}
                </Link>
              : <span key={i} className="text-sm font-mono text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200">
                  {inv.purchaseRef || inv.apId.slice(-6)}
                </span>
          )}
        </div>
      </SectionCard>

      {/* Payment schedule */}
      <SectionCard title="Plan de pago" icon={Calendar}>
        {agreement.paymentScheduleType === 'INSTALLMENTS' ? (
          <div className="space-y-2">
            {agreement.installments.map((inst, i) => {
              const c = instColor(inst);
              const cm = instColorMap[c];
              const dueMs = new Date(inst.dueDate.slice(0, 10) + 'T00:00:00').getTime();
              const daysLeft = inst.status === 'PENDING' ? Math.ceil((dueMs - todayMs) / 86400000) : null;
              const daysLabel = daysLeft === null ? '' : daysLeft < 0
                ? `Vencida hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) !== 1 ? 's' : ''}`
                : daysLeft === 0 ? 'Vence hoy'
                : `Faltan ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`;
              const instId = inst.id ?? `inst-${i}`;
              const isUploadingInst = uploadingInstId === inst.id;
              return (
                <div key={instId} className={`rounded-xl overflow-hidden ${cm.row}`}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${cm.circle}`}>
                      {inst.status === 'PAID' ? <CheckCircle size={15} /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${cm.date}`}>
                        {inst.status === 'PAID'
                          ? `Pagada el ${inst.paidDate ? new Date(inst.paidDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}`
                          : `Vence: ${new Date(inst.dueDate.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                      </div>
                      {daysLabel && <div className="text-xs text-gray-400 mt-0.5">{daysLabel}</div>}
                    </div>
                    <div className="font-bold text-gray-800 flex-shrink-0">{sym} {inst.amount.toFixed(2)}</div>
                    {inst.status === 'PENDING' && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cm.badge}`}>
                        {c === 'red' ? 'Vencida' : c === 'yellow' ? 'Próxima' : 'Pendiente'}
                      </span>
                    )}
                  </div>

                  {/* Voucher — solo para cuotas pagadas */}
                  {inst.status === 'PAID' && (
                    <div className="px-3 pb-3 pt-0 border-t border-green-100">
                      {inst.voucherUrl && (
                        <button onClick={() => setLightboxUrl(inst.voucherUrl!)}
                          className="block w-full max-w-xs rounded-lg overflow-hidden border border-green-200 hover:border-primary-400 transition-colors mb-2">
                          <img src={inst.voucherUrl} alt="Voucher" className="w-full object-cover max-h-32" />
                        </button>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {inst.voucherUrl ? (
                          <button onClick={() => setLightboxUrl(inst.voucherUrl!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 text-primary-600 text-xs font-medium transition-colors border border-green-200">
                            <Eye size={13} /> Ver foto
                          </button>
                        ) : (
                          <span className="text-xs text-green-600 italic">Sin comprobante</span>
                        )}
                        <input type="file" accept="image/*" capture="environment"
                          className="hidden" id={`inst-cam-${instId}`}
                          onChange={async e => { const f = e.target.files?.[0]; if (f && inst.id) { await handleInstVoucherFile(f, inst.id); e.target.value = ''; } }} />
                        <input type="file" accept="image/*"
                          className="hidden" id={`inst-gal-${instId}`}
                          onChange={async e => { const f = e.target.files?.[0]; if (f && inst.id) { await handleInstVoucherFile(f, inst.id); e.target.value = ''; } }} />
                        <label htmlFor={`inst-cam-${instId}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors border border-green-200 ${isUploadingInst ? 'opacity-50 pointer-events-none' : ''} ${inst.voucherUrl ? 'bg-white hover:bg-gray-50 text-gray-600' : 'bg-white hover:bg-primary-50 text-primary-600'}`}>
                          <Camera size={13} /> {inst.voucherUrl ? 'Cambiar' : 'Cámara'}
                        </label>
                        <label htmlFor={`inst-gal-${instId}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium cursor-pointer transition-colors border border-green-200 ${isUploadingInst ? 'opacity-50 pointer-events-none' : ''}`}>
                          <ImageIcon size={13} /> Galería
                        </label>
                        {isUploadingInst && <span className="text-xs text-gray-400 animate-pulse">Subiendo...</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : agreement.dueDate ? (() => {
          const dueMs = new Date(agreement.dueDate.slice(0, 10) + 'T00:00:00').getTime();
          const diff = Math.ceil((dueMs - todayMs) / 86400000);
          const cls = diff < 0 ? 'text-red-600 font-bold' : diff <= 3 ? 'text-yellow-600 font-medium' : 'text-gray-700';
          const label = diff < 0 ? `Vencido hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}` : diff === 0 ? 'Vence hoy' : `Faltan ${diff} día${diff !== 1 ? 's' : ''}`;
          return (
            <div className="flex items-center gap-3">
              <span className={`text-sm ${cls}`}>{new Date(agreement.dueDate.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full ${diff < 0 ? 'bg-red-100 text-red-700' : diff <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{label}</span>
            </div>
          );
        })() : <span className="text-sm text-gray-400">Sin fecha definida</span>}
      </SectionCard>

      {/* Payments */}
      <SectionCard title={`Pagos registrados (${agreement.payments.length})`} icon={CreditCard}>
        {agreement.payments.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-4">Sin pagos registrados aún</p>
        ) : (
          <div className="space-y-4">
            {agreement.payments.map((p, i) => {
              const payId = p.id ?? `pay-${i}`;
              const isUploading = uploadingId === p.id;
              return (
                <div key={payId} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  {/* Payment header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-gray-800">{sym} {p.amount.toFixed(2)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{new Date(p.paymentDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                      <Hash size={11} className="text-gray-400" />
                      <span className="font-mono">{p.codigoTransferencia}</span>
                    </div>
                  </div>
                  {p.notes && <p className="text-sm text-gray-500 italic">{p.notes}</p>}

                  {/* Voucher section — siempre muestra los 3 botones */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Comprobante de pago</div>

                    {/* Thumbnail */}
                    {p.voucherUrl && (
                      <button onClick={() => setLightboxUrl(p.voucherUrl!)}
                        className="block w-full max-w-xs rounded-xl overflow-hidden border border-gray-200 hover:border-primary-400 transition-colors mb-2">
                        <img src={p.voucherUrl} alt="Voucher" className="w-full object-cover max-h-40" />
                      </button>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Ver foto */}
                      {p.voucherUrl ? (
                        <button onClick={() => setLightboxUrl(p.voucherUrl!)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-600 text-xs font-medium transition-colors">
                          <Eye size={13} /> Ver foto
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sin comprobante adjunto</span>
                      )}

                      {/* Inputs ocultos siempre presentes */}
                      <input type="file" accept="image/*" capture="environment"
                        className="hidden" id={`cam-${payId}`}
                        onChange={async e => { const f = e.target.files?.[0]; if (f && p.id) { await handleVoucherFile(f, p.id); e.target.value = ''; } }} />
                      <input type="file" accept="image/*"
                        className="hidden" id={`gal-${payId}`}
                        onChange={async e => { const f = e.target.files?.[0]; if (f && p.id) { await handleVoucherFile(f, p.id); e.target.value = ''; } }} />

                      {/* Cámara */}
                      <label htmlFor={`cam-${payId}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''} ${p.voucherUrl ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-primary-50 hover:bg-primary-100 text-primary-600'}`}>
                        <Camera size={13} /> {p.voucherUrl ? 'Cambiar' : 'Cámara'}
                      </label>

                      {/* Galería */}
                      <label htmlFor={`gal-${payId}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium cursor-pointer transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <ImageIcon size={13} /> Galería
                      </label>

                      {isUploading && <span className="text-xs text-gray-400 animate-pulse">Subiendo...</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {agreement.status === 'CANCELLED' && agreement.cancellationReason && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <AlertCircle size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Motivo de anulación</div>
            <div className="text-sm text-gray-700">{agreement.cancellationReason}</div>
          </div>
        </div>
      )}

      <ImageModal url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
