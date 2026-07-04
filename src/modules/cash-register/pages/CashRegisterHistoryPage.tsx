import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCashRegisters, useCashRegisterById, useCloseCashRegister } from '../hooks/useCashRegister';
import { Pagination } from '../../../shared/components/Pagination';
import { Modal } from '../../../shared/components/Modal';
import {
  History, Wallet, Lock, ChevronDown, ChevronRight, Layers,
  TrendingUp, TrendingDown, ArrowRightLeft, Eye, CalendarDays, Receipt,
} from 'lucide-react';
import type { CashRegister, CashRegisterEntry } from '../../../shared/types';
import { getTodayDateString, getMonthRange } from '../../../shared/utils/date.util';
import { groupEntries } from '../utils/groupEntries';

const categoryLabels: Record<string, string> = {
  SALE: 'Venta', CREDIT_PAYMENT: 'Pago Crédito', PURCHASE: 'Compra', ADJUSTMENT: 'Ajuste', OTHER: 'Otro',
};

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function calcTotals(entries: CashRegisterEntry[]) {
  const active = entries.filter(e => !e.isDeleted);
  const income = active.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const expense = active.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  return { income, expense };
}

export function CashRegisterHistoryPage() {
  const monthRange = getMonthRange();
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState(monthRange.start);
  const [endDate, setEndDate] = useState(monthRange.end);
  const [selectedId, setSelectedId] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashRegister | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [expandedDetailGroups, setExpandedDetailGroups] = useState<Set<string>>(new Set());

  const { data, isLoading } = useCashRegisters({ page, limit: 20, startDate: startDate || undefined, endDate: endDate || undefined });
  const { data: detail } = useCashRegisterById(selectedId);
  const closeRegister = useCloseCashRegister();

  const registers: CashRegister[] = data?.data || [];
  const total = data?.total || 0;
  const today = getTodayDateString();

  const openDetail = (reg: CashRegister) => { setSelectedId(reg.id); setExpandedDetailGroups(new Set()); setShowDetail(true); };
  const openClose = (reg: CashRegister) => { setCloseTarget(reg); setCloseNotes(''); setShowCloseModal(true); };
  const handleClose = async () => {
    if (!closeTarget) return;
    await closeRegister.mutateAsync({ registerId: closeTarget.id, data: { notes: closeNotes } });
    setShowCloseModal(false);
  };

  const toggleDetailGroup = (id: string) => setExpandedDetailGroups(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Period summary
  const periodSummary = useMemo(() => {
    const totalIncome = registers.reduce((s, r) => s + calcTotals(r.entries).income, 0);
    const totalExpense = registers.reduce((s, r) => s + calcTotals(r.entries).expense, 0);
    const open = registers.filter(r => r.status === 'OPEN').length;
    return { totalIncome, totalExpense, open };
  }, [registers]);

  // Detail data
  const detailEntries: CashRegisterEntry[] = detail?.entries || [];
  const detailGroups = useMemo(() => groupEntries(detailEntries), [detailEntries]);
  const detailActive = detailEntries.filter(e => !e.isDeleted);
  const detailIncome = detailActive.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const detailExpense = detailActive.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const detailNet = (detail?.openingBalance || 0) + detailIncome - detailExpense;

  const renderDetailEntry = (e: CashRegisterEntry, nested: boolean, key: React.Key) => (
    <tr key={key} className={`border-b border-gray-50 transition-colors
      ${e.isDeleted ? 'opacity-40 bg-red-50/20' : e.type === 'INCOME' ? 'hover:bg-primary-50/40' : 'hover:bg-red-50/40'}
      ${nested ? 'bg-gray-50/40' : ''}`}>
      <td className={`px-3 py-2.5 ${nested ? 'pl-8' : ''}`}>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold
          ${e.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
          {e.type === 'INCOME' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
          {e.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
        </span>
        {e.createdAt && (
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
            {new Date(e.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
          {categoryLabels[e.category] || e.category}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs text-gray-700 leading-snug">
          {e.description.replace(/\s*\[.*?\]\s*$/, '')}
        </div>
        {e.isDeleted && <div className="text-[10px] text-red-500 mt-0.5 font-medium">✕ Anulado</div>}
      </td>
      <td className="px-3 py-2.5 text-center">
        {e.voucherType === 'BOLETA'
          ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100 text-primary-700">Boleta</span>
          : e.voucherType === 'FACTURA'
            ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">Factura</span>
            : <span className="text-gray-300 text-xs">—</span>}
      </td>
      <td className={`px-3 py-2.5 text-right font-bold text-xs ${e.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
        <span className="font-normal opacity-60 mr-0.5">{e.type === 'INCOME' ? '+' : '−'}</span>
        S/ {e.amount.toFixed(2)}
      </td>
    </tr>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <History size={22} className="text-primary-600" /> Historial de Cajas
        </h1>
      </div>

      {/* Nav tabs */}
      <div className="flex gap-2 mb-6">
        <Link to="/cash-register"
          className="flex items-center gap-1.5 px-4 py-2 text-gray-500 hover:text-gray-700 rounded-full text-sm font-medium border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
          <Wallet size={14} /> Hoy
        </Link>
        <span className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-full text-sm font-semibold shadow-sm shadow-primary-200">
          <History size={14} /> Historial de Cajas
        </span>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Desde</label>
            <input type="date" value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Hasta</label>
            <input type="date" value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors" />
          </div>
          {(startDate !== monthRange.start || endDate !== monthRange.end) && (
            <button onClick={() => { setStartDate(monthRange.start); setEndDate(monthRange.end); setPage(1); }}
              className="px-3 py-2 text-sm text-primary-600 hover:text-primary-800 font-medium border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors">
              Mes actual
            </button>
          )}
          {registers.length > 0 && (
            <div className="ml-auto flex items-center gap-4 text-sm text-gray-500">
              <span><span className="font-semibold text-gray-700">{total}</span> caja{total !== 1 ? 's' : ''}</span>
              {periodSummary.open > 0 && (
                <span className="text-amber-600 font-medium">{periodSummary.open} abierta{periodSummary.open !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Period summary cards */}
      {!isLoading && registers.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-xl border border-primary-100 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-primary-500 uppercase tracking-wide">Total ingresos del período</p>
              <div className="p-1.5 bg-primary-50 rounded-lg"><TrendingUp size={13} className="text-primary-500" /></div>
            </div>
            <p className="text-xl font-bold text-primary-700">+ S/ {periodSummary.totalIncome.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border border-red-100 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wide">Total egresos del período</p>
              <div className="p-1.5 bg-red-50 rounded-lg"><TrendingDown size={13} className="text-red-400" /></div>
            </div>
            <p className="text-xl font-bold text-red-600">− S/ {periodSummary.totalExpense.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Registers list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          <CalendarDays size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-600">Cajas registradas</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
          </div>
        ) : registers.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays size={36} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm text-gray-400">No hay cajas en este período</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Fecha</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Apertura</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-primary-500 uppercase tracking-wide">Ingresos</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-red-400 uppercase tracking-wide">Egresos</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cierre</th>
                <th className="px-5 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {registers.map(reg => {
                const { income, expense } = calcTotals(reg.entries);
                const net = reg.closingBalance ?? ((reg.openingBalance || 0) + income - expense);
                const isOpen = reg.status === 'OPEN';
                const isToday = reg.date === today;

                return (
                  <tr key={reg.id}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50/60
                      ${isToday ? 'bg-primary-50/20' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {isToday && (
                          <span className="px-1.5 py-0.5 bg-primary-100 text-primary-700 text-[10px] font-bold rounded-full uppercase">Hoy</span>
                        )}
                        <span className="text-sm font-medium text-gray-800 capitalize">{formatDate(reg.date)}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {reg.entries.filter(e => !e.isDeleted).length} movimiento{reg.entries.filter(e => !e.isDeleted).length !== 1 ? 's' : ''}
                        {reg.entries.some(e => e.isDeleted) && (
                          <span className="text-red-400 ml-1">· {reg.entries.filter(e => e.isDeleted).length} anulado{reg.entries.filter(e => e.isDeleted).length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm text-gray-600 font-medium">
                      S/ {reg.openingBalance.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-semibold text-primary-700">+ S/ {income.toFixed(2)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-semibold text-red-600">− S/ {expense.toFixed(2)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {reg.closingBalance != null ? (
                        <span className={`text-sm font-bold ${net >= reg.openingBalance ? 'text-gray-800' : 'text-red-700'}`}>
                          S/ {reg.closingBalance.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold
                        ${isOpen ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                        {isOpen ? '● Abierta' : '● Cerrada'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => openDetail(reg)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">
                          <Eye size={12} /> Detalle
                        </button>
                        {isOpen && !isToday && (
                          <button onClick={() => openClose(reg)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                            <Lock size={12} /> Cerrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4">
        <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={setPage} />
      </div>

      {/* ── Modal detalle ── */}
      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)}
        title={`Caja del ${detail?.date ? formatDate(detail.date) : '...'}`} size="lg">
        <div className="space-y-4">

          {/* Status + notes */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold
              ${detail?.status === 'CLOSED' ? 'bg-gray-100 text-gray-500' : 'bg-primary-100 text-primary-700'}`}>
              {detail?.status === 'CLOSED' ? '● Cerrada' : '● Abierta'}
            </span>
            {detail?.notes && (
              <span className="text-xs text-gray-500 italic">"{detail.notes}"</span>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Apertura</p>
              <p className="text-sm font-bold text-gray-700">S/ {(detail?.openingBalance || 0).toFixed(2)}</p>
            </div>
            <div className="bg-primary-50 border border-primary-100 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[10px] text-primary-500 uppercase tracking-wide font-semibold mb-1">Ingresos</p>
              <p className="text-sm font-bold text-primary-700">+ S/ {detailIncome.toFixed(2)}</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[10px] text-red-400 uppercase tracking-wide font-semibold mb-1">Egresos</p>
              <p className="text-sm font-bold text-red-600">− S/ {detailExpense.toFixed(2)}</p>
            </div>
            <div className={`border rounded-xl px-3 py-2.5 text-center ${detail?.closingBalance != null ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${detail?.closingBalance != null ? 'text-blue-400' : 'text-gray-400'}`}>
                {detail?.closingBalance != null ? 'Cierre' : 'Balance'}
              </p>
              <p className={`text-sm font-bold ${detail?.closingBalance != null ? 'text-blue-700' : 'text-gray-600'}`}>
                S/ {(detail?.closingBalance ?? detailNet).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Entries */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/60 border-b border-gray-100">
              <Receipt size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-600">Movimientos</span>
              {detailActive.length > 0 && (
                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-semibold rounded-full">{detailActive.length}</span>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Categoría</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Descripción</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Comprobante</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {detailGroups.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-gray-400">Sin movimientos</td></tr>
                  )}
                  {detailGroups.map((g, gi) => {
                    if (!g.groupId || g.entries.length === 1) {
                      return renderDetailEntry(g.entries[0], false, gi);
                    }
                    const isOpen = expandedDetailGroups.has(g.groupId);
                    const first = g.entries[0];
                    const groupTotal = g.total ?? g.entries.reduce((s, e) => s + e.amount, 0);
                    const baseDesc = first.description.replace(/\s*\(\d+ de \d+\)\s*$/, '').replace(/\s*\[.*?\]\s*$/, '');
                    return (
                      <React.Fragment key={g.groupId}>
                        <tr onClick={() => toggleDetailGroup(g.groupId!)}
                          className={`cursor-pointer border-b border-gray-50 transition-colors ${first.type === 'INCOME' ? 'bg-primary-50/30 hover:bg-primary-50/60' : 'bg-red-50/30 hover:bg-red-50/60'}`}>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 text-[10px]">
                              <span className="text-gray-400">{isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
                              <span className={`font-semibold ${first.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                                {first.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                              {categoryLabels[first.category] || first.category}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold mr-1.5">
                              <Layers size={9} /> Grupo · {g.entries.length}
                            </span>
                            <span className="text-gray-700">{baseDesc}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center"><span className="text-gray-300 text-xs">—</span></td>
                          <td className={`px-3 py-2.5 text-right font-bold text-xs ${first.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                            <span className="font-normal opacity-60 mr-0.5">{first.type === 'INCOME' ? '+' : '−'}</span>
                            S/ {groupTotal.toFixed(2)}
                          </td>
                        </tr>
                        {isOpen && g.entries.map(e => renderDetailEntry(e, true, `${g.groupId}-${e.id}`))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal cerrar ── */}
      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)}
        title={`Cerrar Caja — ${closeTarget?.date ? formatDate(closeTarget.date) : ''}`}>
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
            Esta caja quedó abierta sin cerrarse. Al cerrarla no se podrán modificar sus entradas.
          </div>
          {closeTarget && (() => {
            const { income, expense } = calcTotals(closeTarget.entries);
            const net = (closeTarget.openingBalance || 0) + income - expense;
            return (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Balance apertura</span><span className="font-medium">S/ {closeTarget.openingBalance.toFixed(2)}</span></div>
                <div className="flex justify-between text-primary-600"><span>+ Total ingresos</span><span className="font-semibold">S/ {income.toFixed(2)}</span></div>
                <div className="flex justify-between text-red-600"><span>− Total egresos</span><span className="font-semibold">S/ {expense.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-gray-800 pt-2 mt-1 border-t border-gray-200">
                  <span>Balance de cierre</span><span>S/ {net.toFixed(2)}</span>
                </div>
              </div>
            );
          })()}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
            <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} />
          </div>
          <button onClick={handleClose} disabled={closeRegister.isPending}
            className="w-full py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-900 disabled:opacity-50 font-semibold transition-colors flex items-center justify-center gap-2">
            <Lock size={15} />
            {closeRegister.isPending ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
