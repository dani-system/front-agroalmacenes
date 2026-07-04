import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from '../hooks/useUnits';
import { DataTable } from '../../../shared/components/DataTable';
import { Modal } from '../../../shared/components/Modal';
import { Plus, Edit2, Ruler, Trash2 } from 'lucide-react';
import { productService } from '../../products/services/productService';
import type { Product } from '../../../shared/types';

interface Unit { id: string; name: string; abbreviation?: string; isActive: boolean; }

export function UnitsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', isActive: true });

  const { data: units, isLoading } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();

  const { data: allProductsData } = useQuery({
    queryKey: ['products-active-all'],
    queryFn: () => productService.getAll({ page: 1, limit: 9999, isActive: true }),
    staleTime: 0,
  });

  const productCountByUnit = useMemo(() => {
    const products: Product[] = (allProductsData as any)?.data ?? allProductsData ?? [];
    const counts: Record<string, number> = {};
    products.forEach((p: Product) => {
      if (p.unit) counts[p.unit] = (counts[p.unit] || 0) + 1;
    });
    return counts;
  }, [allProductsData]);

  const openCreate = () => { setEditing(null); setForm({ name: '', abbreviation: '', isActive: true }); setShowModal(true); };
  const openEdit = (unit: Unit) => { setEditing(unit); setForm({ name: unit.name, abbreviation: unit.abbreviation || '', isActive: unit.isActive }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) await updateUnit.mutateAsync({ id: editing.id, data: form });
    else await createUnit.mutateAsync({ name: form.name, abbreviation: form.abbreviation || undefined });
    setShowModal(false);
  };

  const list: Unit[] = Array.isArray(units) ? units : [];

  const columns = [
    { key: 'name', header: 'Nombre' },
    { key: 'abbreviation', header: 'Abreviatura', render: (item: Unit) => item.abbreviation || <span className="text-gray-400">—</span> },
    {
      key: 'products', header: 'Productos',
      render: (item: Unit) => {
        const count = productCountByUnit[item.name] || 0;
        return count > 0
          ? <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-semibold rounded-full">{count} prod.</span>
          : <span className="text-gray-400 text-xs">—</span>;
      },
    },
    {
      key: 'isActive', header: 'Estado',
      render: (item: Unit) => (
        <span className={`px-2 py-1 rounded-full text-xs ${item.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
          {item.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Acciones',
      render: (item: Unit) => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800"><Edit2 size={16} /></button>
          {item.isActive && <button onClick={() => setDeleteTarget(item)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Ruler size={24} /> Unidades de Medida</h1>
        <button onClick={openCreate} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          <Plus size={18} /> Nueva Unidad
        </button>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center"><Ruler size={36} className="mx-auto mb-2 text-gray-200" /><p className="text-sm text-gray-400">Sin unidades registradas</p></div>
        ) : list.map((unit: Unit) => {
          const count = productCountByUnit[unit.name] || 0;
          return (
            <div key={unit.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{unit.name}</span>
                  {unit.abbreviation && <span className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{unit.abbreviation}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${unit.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
                    {unit.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                  {count > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full">{count} prod.</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(unit)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                  <Edit2 size={15} />
                </button>
                {unit.isActive && (
                  <button onClick={() => setDeleteTarget(unit)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <DataTable columns={columns} data={list} isLoading={isLoading} />
      </div>

      {/* Modal confirmar eliminar */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Desactivar Unidad">
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            ¿Deseas desactivar la unidad <strong>{deleteTarget?.name}</strong>?
            {deleteTarget && (productCountByUnit[deleteTarget.name] || 0) > 0 && (
              <span className="block mt-2 text-amber-600 text-xs">
                Atención: {productCountByUnit[deleteTarget.name]} producto(s) usan esta unidad. Seguirán funcionando pero la unidad no aparecerá en nuevos registros.
              </span>
            )}
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">Cancelar</button>
            <button
              onClick={async () => { if (deleteTarget) { await deleteUnit.mutateAsync(deleteTarget.id); setDeleteTarget(null); } }}
              disabled={deleteUnit.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
              {deleteUnit.isPending ? 'Desactivando...' : 'Desactivar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal crear/editar */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Unidad' : 'Nueva Unidad de Medida'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Kilogramo, Litro, Saco..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Abreviatura</label>
            <input value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
              placeholder="Ej: kg, L, sac..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Activo</label>
            </div>
          )}
          <button type="submit" disabled={editing ? updateUnit.isPending : createUnit.isPending}
            className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {editing ? (updateUnit.isPending ? 'Actualizando...' : 'Actualizar') : (createUnit.isPending ? 'Creando...' : 'Crear')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
