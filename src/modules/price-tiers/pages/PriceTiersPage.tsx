import React, { useState } from 'react';
import { usePriceTiers, useCreatePriceTier, useUpdatePriceTier } from '../hooks/usePriceTiers';
import { DataTable } from '../../../shared/components/DataTable';
import { Modal } from '../../../shared/components/Modal';
import { Plus, Edit2, Tag } from 'lucide-react';
import type { PriceTier } from '../../../shared/types';

export function PriceTiersPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PriceTier | null>(null);

  const { data: tiers, isLoading } = usePriceTiers(false);
  const createTier = useCreatePriceTier();
  const updateTier = useUpdatePriceTier();

  const [form, setForm] = useState({ name: '', description: '', priority: 0, isActive: true });

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', priority: 0, isActive: true }); setShowModal(true); };
  const openEdit = (tier: PriceTier) => { setEditing(tier); setForm({ name: tier.name, description: tier.description || '', priority: tier.priority, isActive: tier.isActive }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) await updateTier.mutateAsync({ id: editing.id, data: form });
    else { const { isActive, ...createData } = form; await createTier.mutateAsync(createData); }
    setShowModal(false);
  };

  const list = Array.isArray(tiers) ? tiers : [];

  const columns = [
    { key: 'name', header: 'Nombre' },
    { key: 'description', header: 'Descripción' },
    { key: 'priority', header: 'Prioridad' },
    { key: 'isActive', header: 'Estado', render: (item: PriceTier) => <span className={`px-2 py-1 rounded-full text-xs ${item.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>{item.isActive ? 'Activo' : 'Inactivo'}</span> },
    { key: 'actions', header: 'Acciones', render: (item: PriceTier) => (
      <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800"><Edit2 size={16} /></button>
    )},
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Tag size={24} /> Rangos de Precio</h1>
        <button onClick={openCreate} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"><Plus size={18} /> Nuevo Rango</button>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center"><Tag size={36} className="mx-auto mb-2 text-gray-200" /><p className="text-sm text-gray-400">Sin rangos de precio</p></div>
        ) : list.map((tier: PriceTier) => (
          <div key={tier.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-800">{tier.name}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">P{tier.priority}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tier.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
                  {tier.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              {tier.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{tier.description}</p>}
            </div>
            <button onClick={() => openEdit(tier)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0">
              <Edit2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <DataTable columns={columns} data={list} isLoading={isLoading} />
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Rango' : 'Nuevo Rango'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" /><label className="text-sm font-medium text-gray-700">Activo</label></div>
          <button type="submit" disabled={editing ? updateTier.isPending : createTier.isPending} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">{editing ? (updateTier.isPending ? 'Actualizando...' : 'Actualizar') : (createTier.isPending ? 'Creando...' : 'Crear')}</button>
        </form>
      </Modal>
    </div>
  );
}
