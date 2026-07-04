import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCashRegisterToday, useOpenCashRegister, useAddCashEntry, useEditCashEntry, useDeleteCashEntry, useCloseCashRegister, useAdjustOpeningBalance } from '../hooks/useCashRegister';
import { usePaymentMethods } from '../../payment-methods/hooks/usePaymentMethods';
import { useRucLookup } from '../../../shared/hooks/useLookup';
import { useSupplierByRuc, useCreateSupplier } from '../../suppliers/hooks/useSuppliers';
import { Modal } from '../../../shared/components/Modal';
import { Wallet, TrendingUp, TrendingDown, Edit2, Trash2, Lock, History, ChevronDown, ChevronRight, Layers, Search, Loader2, SlidersHorizontal, Receipt, ArrowRightLeft } from 'lucide-react';
import type { CashRegisterEntry } from '../../../shared/types';
import { groupEntries } from '../utils/groupEntries';

export function CashRegisterPage() {
  const { data: register, isLoading } = useCashRegisterToday();
  const openCashRegister = useOpenCashRegister();
  const addEntry = useAddCashEntry();
  const editEntry = useEditCashEntry();
  const deleteEntryMutation = useDeleteCashEntry();
  const closeRegister = useCloseCashRegister();
  const adjustOpening = useAdjustOpeningBalance();

  const [openingAmount, setOpeningAmount] = useState(0);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ openingBalance: 0, reason: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CashRegisterEntry | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: paymentMethods = [] } = usePaymentMethods();
  const rucLookup = useRucLookup();
  const supplierByRuc = useSupplierByRuc();
  const createSupplier = useCreateSupplier();

  const [addForm, setAddForm] = useState({ type: 'INCOME' as string, category: 'OTHER' as string, description: '', amount: 0, voucherType: 'NONE' as string, voucherSeries: '', voucherNumber: '', paymentMethodName: '', remisionSerie: '', remisionCorrelativo: '', remisionFecha: '' });
  const [editForm, setEditForm] = useState({ amount: 0, reason: '', voucherType: 'NONE' as string, voucherSeries: '', voucherNumber: '' });
  const [deleteReason, setDeleteReason] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [rucInput, setRucInput] = useState('');
  const [rucFound, setRucFound] = useState('');
  const [rucLoading, setRucLoading] = useState(false);

  const isClosed = register?.status === 'CLOSED';
  const entries: CashRegisterEntry[] = register?.entries || [];
  const activeEntries = entries.filter(e => !e.isDeleted);
  const totalIncome = activeEntries.filter(e => e.type === 'INCOME').reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = activeEntries.filter(e => e.type === 'EXPENSE').reduce((sum, e) => sum + e.amount, 0);
  const netBalance = (register?.openingBalance || 0) + totalIncome - totalExpense;

  const openAddIncome = () => { setAddForm({ type: 'INCOME', category: 'OTHER', description: '', amount: 0, voucherType: 'NONE', voucherSeries: '', voucherNumber: '', paymentMethodName: '', remisionSerie: '', remisionCorrelativo: '', remisionFecha: '' }); setShowAddModal(true); };
  const openAddExpense = () => { setAddForm({ type: 'EXPENSE', category: 'OTHER', description: '', amount: 0, voucherType: 'NONE', voucherSeries: '', voucherNumber: '', paymentMethodName: 'Efectivo', remisionSerie: '', remisionCorrelativo: '', remisionFecha: '' }); setRucInput(''); setRucFound(''); setShowAddModal(true); };
  const openEdit = (entry: CashRegisterEntry) => { setSelectedEntry(entry); setEditForm({ amount: entry.amount, reason: '', voucherType: entry.voucherType || 'NONE', voucherSeries: entry.voucherSeries || '', voucherNumber: entry.voucherNumber || '' }); setShowEditModal(true); };
  const openDelete = (entry: CashRegisterEntry) => { setSelectedEntry(entry); setDeleteReason(''); setShowDeleteModal(true); };

  const handleRucLookup = async () => {
    const ruc = rucInput.trim();
    if (ruc.length !== 11) return;
    setRucLoading(true);
    try {
      const local = await supplierByRuc.mutateAsync(ruc);
      if (local) { setRucFound(local.businessName); setAddForm((prev) => ({ ...prev, description: local.businessName })); setRucLoading(false); return; }
    } catch { /* not found locally */ }
    try {
      const result = await rucLookup.mutateAsync(ruc);
      if (result?.razonSocial) {
        await createSupplier.mutateAsync({ ruc, businessName: result.razonSocial, address: result.direccion || '' });
        setRucFound(result.razonSocial);
        setAddForm((prev) => ({ ...prev, description: result.razonSocial }));
      }
    } catch { } finally { setRucLoading(false); }
  };

  const handleOpen = async (e: React.FormEvent) => { e.preventDefault(); await openCashRegister.mutateAsync({ openingBalance: openingAmount }); };
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const desc = addForm.paymentMethodName ? `${addForm.description} [${addForm.paymentMethodName}]` : addForm.description;
    const { paymentMethodName, remisionSerie, remisionCorrelativo, remisionFecha, ...rest } = addForm;
    const hasRemision = addForm.type === 'EXPENSE' && addForm.voucherType === 'FACTURA' && remisionSerie && remisionCorrelativo && remisionFecha;
    await addEntry.mutateAsync({ registerId: register.id, data: { ...rest, description: desc, ...(hasRemision ? { remisionGuia: { serie: remisionSerie, correlativo: remisionCorrelativo, fecha: remisionFecha } } : {}) } });
    setShowAddModal(false);
  };
  const handleEdit = async (e: React.FormEvent) => { e.preventDefault(); await editEntry.mutateAsync({ registerId: register.id, entryId: selectedEntry!.id, data: editForm }); setShowEditModal(false); };
  const handleDelete = async (e: React.FormEvent) => { e.preventDefault(); await deleteEntryMutation.mutateAsync({ registerId: register.id, entryId: selectedEntry!.id, data: { reason: deleteReason } }); setShowDeleteModal(false); };
  const handleClose = async () => { await closeRegister.mutateAsync({ registerId: register.id, data: { notes: closeNotes } }); setShowCloseModal(false); };

  const categoryLabels: Record<string, string> = { SALE: 'Venta', CREDIT_PAYMENT: 'Pago Crédito', PURCHASE: 'Compra', ADJUSTMENT: 'Ajuste', OTHER: 'Otro' };
  const groupedRows = useMemo(() => groupEntries([...entries].reverse()), [entries]);

  // ── Entry row ──────────────────────────────────────────────────────────────
  const renderEntryRow = (entry: CashRegisterEntry, nested: boolean, key: React.Key) => (
    <tr key={key} className={`border-b border-gray-50 transition-colors
      ${entry.isDeleted ? 'opacity-40 bg-red-50/30' : entry.type === 'INCOME' ? 'hover:bg-primary-50/40' : 'hover:bg-red-50/40'}
      ${nested ? 'bg-gray-50/40' : ''}`}>
      <td className={`px-4 py-3 ${nested ? 'pl-10' : ''}`}>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
          ${entry.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
          {entry.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {entry.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
        </span>
        {entry.createdAt && (
          <div className="text-[10px] text-gray-400 mt-1 font-mono">
            {new Date(entry.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
          {categoryLabels[entry.category] || entry.category}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-700 leading-snug">
          {entry.description.replace(/\s*\[.*?\]\s*$/, '')}
        </div>
        {entry.isDeleted && <div className="text-xs text-red-500 mt-0.5 font-medium">✕ Anulado: {entry.deleteReason}</div>}
        {!entry.isDeleted && entry.editHistory?.length > 0 && (
          <div className="text-[10px] text-blue-500 mt-0.5">Editado {entry.editHistory.length}×</div>
        )}
      </td>
      <td className="px-4 py-3">
        {(() => {
          const match = entry.description.match(/\[(.+?)\]$/);
          return match
            ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{match[1]}</span>
            : <span className="text-gray-300 text-xs">—</span>;
        })()}
      </td>
      <td className={`px-4 py-3 text-right font-bold ${entry.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
        <span className="text-xs font-normal opacity-60 mr-0.5">{entry.type === 'INCOME' ? '+' : '−'}</span>
        S/ {entry.amount.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-center">
        {entry.voucherType === 'BOLETA' ? (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100 text-primary-700">Boleta</span>
            {entry.voucherSeries && entry.voucherNumber && <span className="text-[10px] text-gray-400 font-mono">{entry.voucherSeries}-{entry.voucherNumber}</span>}
          </div>
        ) : entry.voucherType === 'FACTURA' ? (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">Factura</span>
            {entry.voucherSeries && entry.voucherNumber && <span className="text-[10px] text-gray-400 font-mono">{entry.voucherSeries}-{entry.voucherNumber}</span>}
            {entry.remisionGuia && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5 font-medium">
                G.R. {entry.remisionGuia.serie}-{entry.remisionGuia.correlativo}
              </span>
            )}
          </div>
        ) : <span className="text-gray-300 text-xs">—</span>}
      </td>
      {!isClosed && (
        <td className="px-4 py-3">
          {!entry.isDeleted && !nested && (
            <div className="flex gap-1 justify-center">
              <button onClick={() => openEdit(entry)} title="Editar"
                className="p-1.5 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                <Edit2 size={13} />
              </button>
              <button onClick={() => openDelete(entry)} title="Anular"
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );

  // ── Mobile entry card ─────────────────────────────────────────────────────
  const renderEntryCard = (entry: CashRegisterEntry, nested: boolean, key: React.Key) => (
    <div key={key} className={`px-4 py-3.5 transition-colors
      ${entry.isDeleted ? 'opacity-40 bg-red-50/30' : entry.type === 'INCOME' ? 'hover:bg-primary-50/30' : 'hover:bg-red-50/30'}
      ${nested ? 'border-l-4 border-gray-200 bg-gray-50/50 pl-5' : ''}`}>
      {/* Tipo + categoría + hora + monto */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
            ${entry.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
            {entry.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {entry.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
          </span>
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
            {categoryLabels[entry.category] || entry.category}
          </span>
          {entry.createdAt && (
            <span className="text-[10px] text-gray-400 font-mono">
              {new Date(entry.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${entry.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
          <span className="text-xs font-normal opacity-60 mr-0.5">{entry.type === 'INCOME' ? '+' : '−'}</span>
          S/ {entry.amount.toFixed(2)}
        </span>
      </div>
      {/* Descripción */}
      <div className="text-sm text-gray-700 leading-snug mb-2">
        {entry.description.replace(/\s*\[.*?\]\s*$/, '')}
        {entry.isDeleted && <span className="text-xs text-red-500 ml-1.5 font-medium">✕ {entry.deleteReason}</span>}
        {!entry.isDeleted && entry.editHistory?.length > 0 && (
          <span className="text-[10px] text-blue-500 ml-1.5">Editado {entry.editHistory.length}×</span>
        )}
      </div>
      {/* Método + comprobante + acciones */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(() => { const m = entry.description.match(/\[(.+?)\]$/); return m ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{m[1]}</span> : null; })()}
          {entry.voucherType === 'BOLETA' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100 text-primary-700">
              Boleta{entry.voucherSeries && entry.voucherNumber ? ` ${entry.voucherSeries}-${entry.voucherNumber}` : ''}
            </span>
          )}
          {entry.voucherType === 'FACTURA' && (
            <>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                Factura{entry.voucherSeries && entry.voucherNumber ? ` ${entry.voucherSeries}-${entry.voucherNumber}` : ''}
              </span>
              {entry.remisionGuia && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
                  G.R. {entry.remisionGuia.serie}-{entry.remisionGuia.correlativo}
                </span>
              )}
            </>
          )}
        </div>
        {!isClosed && !entry.isDeleted && !nested && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => openEdit(entry)}
              className="p-2 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => openDelete(entry)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  // ── Sin caja ───────────────────────────────────────────────────────────────
  if (!register) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-50 rounded-2xl mb-5">
            <Wallet size={32} className="text-primary-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">No hay caja abierta</h2>
          <p className="text-sm text-gray-500 mb-6">Ingresa el monto inicial para abrir la caja del día</p>
          <form onSubmit={handleOpen} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Monto inicial (S/)</label>
              <input
                type="number" min="0" step="0.01"
                value={openingAmount || ''}
                onChange={e => setOpeningAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl font-bold text-gray-800 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                placeholder="0.00"
              />
            </div>
            <button type="submit" disabled={openCashRegister.isPending}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-semibold disabled:opacity-50 transition-colors shadow-sm shadow-primary-200">
              <Wallet size={18} />
              {openCashRegister.isPending ? 'Abriendo...' : 'Abrir Caja'}
            </button>
          </form>
          <Link to="/cash-register/history"
            className="inline-flex items-center gap-1.5 mt-5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <History size={14} /> Ver historial de cajas
          </Link>
        </div>
      </div>
    );
  }

  // ── Caja abierta / cerrada ─────────────────────────────────────────────────
  const formattedDate = new Date(register.date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={22} className="text-primary-600" /> Caja del Día
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm text-gray-500 capitalize">{formattedDate}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${isClosed ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}`}>
              {isClosed ? '● CERRADA' : '● ABIERTA'}
            </span>
          </div>
        </div>
        {!isClosed && (
          <>
            {/* Mobile: grid 2×2 */}
            <div className="grid grid-cols-2 gap-2 sm:hidden">
              <button onClick={openAddIncome}
                className="flex items-center justify-center gap-2 py-3.5 bg-primary-600 text-white rounded-xl text-sm font-semibold shadow-sm shadow-primary-200 active:scale-[0.97] transition-all">
                <TrendingUp size={17} /> Ingreso
              </button>
              <button onClick={openAddExpense}
                className="flex items-center justify-center gap-2 py-3.5 bg-red-500 text-white rounded-xl text-sm font-semibold shadow-sm shadow-red-200 active:scale-[0.97] transition-all">
                <TrendingDown size={17} /> Egreso
              </button>
              <button onClick={() => { setAdjustForm({ openingBalance: register?.openingBalance || 0, reason: '' }); setShowAdjustModal(true); }}
                className="flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold shadow-sm shadow-amber-200 active:scale-[0.97] transition-all">
                <SlidersHorizontal size={15} /> Ajuste
              </button>
              <button onClick={() => { setCloseNotes(''); setShowCloseModal(true); }}
                className="flex items-center justify-center gap-2 py-2.5 bg-gray-700 text-white rounded-xl text-sm font-semibold active:scale-[0.97] transition-all">
                <Lock size={15} /> Cerrar Caja
              </button>
            </div>
            {/* Tablet / Desktop: fila */}
            <div className="hidden sm:flex flex-wrap gap-2">
              <button onClick={openAddIncome}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-semibold shadow-sm shadow-primary-200 transition-colors">
                <TrendingUp size={15} /> Ingreso
              </button>
              <button onClick={openAddExpense}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-semibold shadow-sm shadow-red-200 transition-colors">
                <TrendingDown size={15} /> Egreso
              </button>
              <button onClick={() => { setAdjustForm({ openingBalance: register?.openingBalance || 0, reason: '' }); setShowAdjustModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 text-sm font-semibold shadow-sm shadow-amber-200 transition-colors">
                <SlidersHorizontal size={15} /> Ajuste
              </button>
              <button onClick={() => { setCloseNotes(''); setShowCloseModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-800 text-sm font-semibold transition-colors">
                <Lock size={15} /> Cerrar Caja
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nav tabs */}
      <div className="flex gap-2 mb-6">
        <span className="px-4 py-2 bg-primary-600 text-white rounded-full text-sm font-semibold shadow-sm shadow-primary-200">
          Hoy
        </span>
        <Link to="/cash-register/history"
          className="flex items-center gap-1.5 px-4 py-2 text-gray-500 hover:text-gray-700 rounded-full text-sm font-medium border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
          <History size={14} /> Historial de Cajas
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Apertura</p>
            <div className="p-1.5 bg-gray-100 rounded-lg"><Wallet size={13} className="text-gray-500" /></div>
          </div>
          <p className="text-xl font-bold text-gray-800">S/ {(register?.openingBalance || 0).toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Saldo inicial</p>
        </div>

        <div className="bg-white rounded-xl border border-primary-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-primary-500 uppercase tracking-wide">Ingresos</p>
            <div className="p-1.5 bg-primary-50 rounded-lg"><TrendingUp size={13} className="text-primary-500" /></div>
          </div>
          <p className="text-xl font-bold text-primary-700">+ S/ {totalIncome.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 mt-1">{activeEntries.filter(e => e.type === 'INCOME').length} movimiento{activeEntries.filter(e => e.type === 'INCOME').length !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-xl border border-red-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wide">Egresos</p>
            <div className="p-1.5 bg-red-50 rounded-lg"><TrendingDown size={13} className="text-red-400" /></div>
          </div>
          <p className="text-xl font-bold text-red-600">− S/ {totalExpense.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 mt-1">{activeEntries.filter(e => e.type === 'EXPENSE').length} movimiento{activeEntries.filter(e => e.type === 'EXPENSE').length !== 1 ? 's' : ''}</p>
        </div>

        <div className={`bg-white rounded-xl shadow-sm px-5 py-4 border ${netBalance >= 0 ? 'border-blue-100' : 'border-red-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${netBalance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Balance Neto</p>
            <div className={`p-1.5 rounded-lg ${netBalance >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
              <ArrowRightLeft size={13} className={netBalance >= 0 ? 'text-blue-500' : 'text-red-500'} />
            </div>
          </div>
          <p className={`text-xl font-bold ${netBalance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>S/ {netBalance.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Apertura + ingresos − egresos</p>
        </div>
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-2">
            <Receipt size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-600">Movimientos</span>
            {activeEntries.length > 0 && (
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[11px] font-semibold rounded-full">{activeEntries.length}</span>
            )}
          </div>
          {entries.some(e => e.isDeleted) && (
            <span className="text-[11px] text-red-400 font-medium">{entries.filter(e => e.isDeleted).length} anulado(s)</span>
          )}
        </div>

        {/* ── Mobile: tarjetas ───────────────────────────────────────────── */}
        <div className="lg:hidden divide-y divide-gray-100">
          {entries.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Receipt size={36} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">No hay movimientos registrados</p>
              {!isClosed && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button onClick={openAddIncome} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700">+ Ingreso</button>
                  <button onClick={openAddExpense} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">+ Egreso</button>
                </div>
              )}
            </div>
          ) : groupedRows.map((group, gi) => {
            const isGroup = !!group.groupId && group.entries.length > 1;
            if (!isGroup) return renderEntryCard(group.entries[0], false, gi);

            const isOpen = expandedGroups.has(group.groupId!);
            const first = group.entries[0];
            const total = group.total ?? group.entries.reduce((s, e) => s + e.amount, 0);
            const baseDesc = first.description.replace(/\s*\(\d+ de \d+\)\s*$/, '').replace(/\s*\[.*?\]\s*$/, '');
            const methodMatch = first.description.match(/\[(.+?)\]/);
            const toggle = () => setExpandedGroups(prev => { const next = new Set(prev); next.has(group.groupId!) ? next.delete(group.groupId!) : next.add(group.groupId!); return next; });

            return (
              <React.Fragment key={group.groupId}>
                <div
                  onClick={toggle}
                  className={`px-4 py-3.5 cursor-pointer transition-colors ${first.type === 'INCOME' ? 'bg-primary-50/40 active:bg-primary-50/70' : 'bg-red-50/40 active:bg-red-50/70'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
                        ${first.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
                        {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        {first.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {first.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                      </span>
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                        {categoryLabels[first.category] || first.category}
                      </span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${first.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                      <span className="text-xs font-normal opacity-60 mr-0.5">{first.type === 'INCOME' ? '+' : '−'}</span>
                      S/ {total.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[11px] font-semibold">
                      <Layers size={10} /> Grupo · {group.entries.length} cuentas
                    </span>
                    <span className="text-sm text-gray-700 truncate">{baseDesc}</span>
                  </div>
                  {methodMatch && (
                    <div className="mt-1.5">
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{methodMatch[1]}</span>
                    </div>
                  )}
                </div>
                {isOpen && group.entries.map((e) => renderEntryCard(e, true, `${group.groupId}-${e.id}`))}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Desktop: tabla ─────────────────────────────────────────────── */}
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Categoría</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Descripción</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Método</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Monto</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Comprobante</th>
                {!isClosed && <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group, gi) => {
                const isGroup = !!group.groupId && group.entries.length > 1;
                if (!isGroup) return renderEntryRow(group.entries[0], false, gi);

                const isOpen = expandedGroups.has(group.groupId!);
                const first = group.entries[0];
                const total = group.total ?? group.entries.reduce((s, e) => s + e.amount, 0);
                const baseDesc = first.description.replace(/\s*\(\d+ de \d+\)\s*$/, '').replace(/\s*\[.*?\]\s*$/, '');
                const methodMatch = first.description.match(/\[(.+?)\]/);

                return (
                  <React.Fragment key={group.groupId}>
                    <tr
                      onClick={() => setExpandedGroups(prev => { const next = new Set(prev); next.has(group.groupId!) ? next.delete(group.groupId!) : next.add(group.groupId!); return next; })}
                      className={`cursor-pointer border-b border-gray-50 transition-colors ${first.type === 'INCOME' ? 'bg-primary-50/30 hover:bg-primary-50/60' : 'bg-red-50/30 hover:bg-red-50/60'}`}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${first.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
                            {first.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {first.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                          {categoryLabels[first.category] || first.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[11px] font-semibold mr-2">
                          <Layers size={10} /> Grupo · {group.entries.length} cuentas
                        </span>
                        <span className="text-sm text-gray-700">{baseDesc}</span>
                      </td>
                      <td className="px-4 py-3">
                        {methodMatch ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{methodMatch[1]}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-sm ${first.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                        <span className="text-xs font-normal opacity-60 mr-0.5">{first.type === 'INCOME' ? '+' : '−'}</span>
                        S/ {total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center"><span className="text-gray-300 text-xs">—</span></td>
                      {!isClosed && <td className="px-4 py-3" />}
                    </tr>
                    {isOpen && group.entries.map((e) => renderEntryRow(e, true, `${group.groupId}-${e.id}`))}
                  </React.Fragment>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={isClosed ? 6 : 7} className="px-4 py-16 text-center">
                    <Receipt size={36} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-sm text-gray-400">No hay movimientos registrados</p>
                    {!isClosed && (
                      <div className="flex items-center justify-center gap-2 mt-3">
                        <button onClick={openAddIncome} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700">+ Ingreso</button>
                        <button onClick={openAddExpense} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">+ Egreso</button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ── */}

      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setRucInput(''); setRucFound(''); }}
        title={addForm.type === 'INCOME' ? 'Nuevo Ingreso' : 'Nuevo Egreso'}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold ${addForm.type === 'INCOME' ? 'bg-primary-50 text-primary-700 border border-primary-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
            {addForm.type === 'INCOME' ? <><TrendingUp size={15} /> Registrando un ingreso</> : <><TrendingDown size={15} /> Registrando un egreso</>}
          </div>
          {addForm.type === 'EXPENSE' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa por RUC <span className="text-gray-400 font-normal text-xs">(opcional)</span></label>
              <div className="flex gap-2">
                <input value={rucInput} onChange={e => { setRucInput(e.target.value.replace(/\D/g, '').slice(0, 11)); setRucFound(''); }}
                  className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="RUC (11 dígitos)" maxLength={11} />
                <button type="button" onClick={handleRucLookup} disabled={rucInput.length !== 11 || rucLoading}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-sm font-medium">
                  {rucLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
                </button>
                {rucFound && <div className="flex-1 min-w-0 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800 font-medium truncate">{rucFound}</div>}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante</label>
            <div className="flex gap-2">
              {[{ value: 'NONE', label: 'Ninguno' }, { value: 'BOLETA', label: 'Boleta' }, { value: 'FACTURA', label: 'Factura' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => setAddForm({ ...addForm, voucherType: opt.value, voucherSeries: '', voucherNumber: '' })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${addForm.voucherType === opt.value
                    ? opt.value === 'BOLETA' ? 'bg-primary-600 text-white border-primary-600'
                      : opt.value === 'FACTURA' ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-600 text-white border-gray-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {(addForm.voucherType === 'BOLETA' || addForm.voucherType === 'FACTURA') && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                <input value={addForm.voucherSeries} onChange={e => setAddForm({ ...addForm, voucherSeries: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="B001" maxLength={4} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
                <input value={addForm.voucherNumber} onChange={e => setAddForm({ ...addForm, voucherNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="00000001" required /></div>
            </div>
          )}
          {addForm.type === 'EXPENSE' && addForm.voucherType === 'FACTURA' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-700 mb-2">Guía de Remisión <span className="font-normal text-amber-500">(opcional)</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
                  <input value={addForm.remisionSerie} onChange={e => setAddForm({ ...addForm, remisionSerie: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white" placeholder="T001" maxLength={4} /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Correlativo</label>
                  <input value={addForm.remisionCorrelativo} onChange={e => setAddForm({ ...addForm, remisionCorrelativo: e.target.value.replace(/\D/g, '').slice(0, 8) })} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white" placeholder="00000001" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input type="date" value={addForm.remisionFecha} onChange={e => setAddForm({ ...addForm, remisionFecha: e.target.value })} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white" /></div>
            </div>
          )}
          {addForm.type === 'INCOME' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
              {paymentMethods.length === 0 ? <p className="text-sm text-gray-400">Cargando...</p> : (
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.map((pm: { id: string; name: string }) => (
                    <button key={pm.id} type="button" onClick={() => setAddForm({ ...addForm, paymentMethodName: pm.name })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${addForm.paymentMethodName === pm.name ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}>
                      {pm.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Monto (S/)</label>
            <input type="number" min="0.01" step="0.01" value={addForm.amount || ''} onChange={e => setAddForm({ ...addForm, amount: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
          <button type="submit" disabled={addEntry.isPending}
            className={`w-full py-2.5 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors ${addForm.type === 'INCOME' ? 'bg-primary-600 hover:bg-primary-700' : 'bg-red-500 hover:bg-red-600'}`}>
            {addEntry.isPending ? 'Registrando...' : addForm.type === 'INCOME' ? 'Registrar Ingreso' : 'Registrar Egreso'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Movimiento">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
            Monto actual: <span className="font-bold text-gray-800">S/ {selectedEntry?.amount.toFixed(2)}</span>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nuevo monto (S/)</label>
            <input type="number" min="0.01" step="0.01" value={editForm.amount || ''} onChange={e => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante</label>
            <div className="flex gap-2">
              {[{ value: 'NONE', label: 'Ninguno' }, { value: 'BOLETA', label: 'Boleta' }, { value: 'FACTURA', label: 'Factura' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => setEditForm({ ...editForm, voucherType: opt.value, voucherSeries: '', voucherNumber: '' })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${editForm.voucherType === opt.value
                    ? opt.value === 'BOLETA' ? 'bg-primary-600 text-white border-primary-600' : opt.value === 'FACTURA' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-600 text-white border-gray-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {(editForm.voucherType === 'BOLETA' || editForm.voucherType === 'FACTURA') && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                <input value={editForm.voucherSeries} onChange={e => setEditForm({ ...editForm, voucherSeries: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="B001" maxLength={4} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
                <input value={editForm.voucherNumber} onChange={e => setEditForm({ ...editForm, voucherNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="00000001" /></div>
            </div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Razón del cambio <span className="text-red-500">*</span></label>
            <textarea value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} required /></div>
          <button type="submit" disabled={editEntry.isPending} className="w-full py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold transition-colors">
            {editEntry.isPending ? 'Guardando...' : 'Guardar cambio'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Anular Movimiento">
        <form onSubmit={handleDelete} className="space-y-4">
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
            Esta acción marcará el movimiento como anulado. No se puede deshacer.
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Razón de anulación <span className="text-red-500">*</span></label>
            <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} required /></div>
          <button type="submit" disabled={deleteEntryMutation.isPending} className="w-full py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 font-semibold transition-colors">
            {deleteEntryMutation.isPending ? 'Anulando...' : 'Confirmar anulación'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Ajuste de Caja">
        <form onSubmit={async (e) => { e.preventDefault(); await adjustOpening.mutateAsync({ registerId: register.id, data: adjustForm }); setShowAdjustModal(false); }} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <SlidersHorizontal size={15} className="mt-0.5 flex-shrink-0" />
            <span>Ajusta el saldo de apertura. Útil cuando la caja se abrió automáticamente por una venta sin saldo inicial.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Apertura actual</div>
              <div className="text-lg font-bold text-gray-700">S/ {(register?.openingBalance || 0).toFixed(2)}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-amber-500 mb-1 uppercase tracking-wide font-semibold">Balance neto</div>
              <div className="text-lg font-bold text-amber-700">S/ {netBalance.toFixed(2)}</div>
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nuevo saldo de apertura (S/)</label>
            <input type="number" min="0" step="0.01" value={adjustForm.openingBalance || ''} onChange={e => setAdjustForm({ ...adjustForm, openingBalance: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-lg text-center font-bold" placeholder="0.00" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Motivo del ajuste <span className="text-red-500">*</span></label>
            <textarea value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} placeholder="Ej: Caja abierta por venta, saldo inicial era S/ 150.00" required minLength={5} /></div>
          <button type="submit" disabled={adjustOpening.isPending || !adjustForm.reason.trim() || adjustForm.openingBalance === (register?.openingBalance || 0)}
            className="w-full py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 font-semibold transition-colors">
            {adjustOpening.isPending ? 'Ajustando...' : 'Confirmar ajuste'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} title="Cerrar Caja">
        {(() => {
          const methodBreakdown: Record<string, { income: number; expense: number }> = {};
          activeEntries.forEach(entry => {
            const match = entry.description.match(/\[(.+?)\]$/);
            const method = match ? match[1] : 'Sin método';
            if (!methodBreakdown[method]) methodBreakdown[method] = { income: 0, expense: 0 };
            if (entry.type === 'INCOME') methodBreakdown[method].income += entry.amount;
            else methodBreakdown[method].expense += entry.amount;
          });
          const methods = Object.entries(methodBreakdown).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense));

          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Al cerrar la caja no se podrán agregar, editar ni anular movimientos.</p>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Balance apertura</span><span className="font-medium">S/ {(register?.openingBalance || 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-primary-600"><span>+ Total ingresos</span><span className="font-semibold">S/ {totalIncome.toFixed(2)}</span></div>
                <div className="flex justify-between text-red-600"><span>− Total egresos</span><span className="font-semibold">S/ {totalExpense.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-gray-800 pt-2 mt-1 border-t border-gray-200">
                  <span>Balance de cierre</span><span>S/ {netBalance.toFixed(2)}</span>
                </div>
              </div>

              {methods.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Desglose por método de pago</label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Método</th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-primary-500 uppercase tracking-wide">Ingresos</th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-red-400 uppercase tracking-wide">Egresos</th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Neto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {methods.map(([method, totals]) => (
                          <tr key={method}>
                            <td className="px-3 py-2 font-medium text-gray-700">{method}</td>
                            <td className="px-3 py-2 text-right text-primary-600 font-medium">{totals.income > 0 ? `S/ ${totals.income.toFixed(2)}` : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right text-red-600 font-medium">{totals.expense > 0 ? `S/ ${totals.expense.toFixed(2)}` : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-800">S/ {(totals.income - totals.expense).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} /></div>
              <button onClick={handleClose} disabled={closeRegister.isPending}
                className="w-full py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-900 disabled:opacity-50 font-semibold transition-colors flex items-center justify-center gap-2">
                <Lock size={15} />
                {closeRegister.isPending ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
