import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories';
import { Modal } from '../../../shared/components/Modal';
import { Plus, Edit2, FolderTree, Trash2, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import type { Category, Product } from '../../../shared/types';
import { productService } from '../../products/services/productService';

export function CategoriesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '', isActive: true, parentId: '' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const { data: allProductsData } = useQuery({
    queryKey: ['products-active-all'],
    queryFn: () => productService.getAll({ page: 1, limit: 9999, isActive: true }),
    staleTime: 0,
  });

  const list: Category[] = Array.isArray(categories) ? categories : [];

  const topLevel = useMemo(() => list.filter(c => !c.parentId), [list]);
  const subsByParent = useMemo(() => {
    const map: Record<string, Category[]> = {};
    list.filter(c => c.parentId).forEach(c => {
      if (!map[c.parentId!]) map[c.parentId!] = [];
      map[c.parentId!].push(c);
    });
    return map;
  }, [list]);

  const productCountByCategory = useMemo(() => {
    const products: Product[] = (allProductsData as any)?.data ?? allProductsData ?? [];
    const counts: Record<string, number> = {};
    products.forEach((p: Product) => { counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
    return counts;
  }, [allProductsData]);

  const openCreateTop = () => {
    setEditing(null);
    setForm({ name: '', description: '', isActive: true, parentId: '' });
    setShowModal(true);
  };

  const openCreateSub = (parentId: string) => {
    setEditing(null);
    setForm({ name: '', description: '', isActive: true, parentId });
    setExpanded(prev => new Set([...prev, parentId]));
    setShowModal(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setForm({ name: category.name, description: category.description || '', isActive: category.isActive, parentId: category.parentId || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { name: form.name.trim(), description: form.description.trim() };
    if (form.parentId) payload.parentId = form.parentId;
    if (editing) {
      await updateCategory.mutateAsync({ id: editing.id, data: { ...payload, isActive: form.isActive } });
    } else {
      await createCategory.mutateAsync(payload);
    }
    setShowModal(false);
  };

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const getParentName = (parentId: string) => list.find(c => c.id === parentId)?.name || '—';

  const isPending = createCategory.isPending || updateCategory.isPending;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FolderTree size={24} /> Categorías
        </h1>
        <button onClick={openCreateTop}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors">
          <Plus size={16} /> Nueva Categoría
        </button>
      </div>

      {/* Summary */}
      {!isLoading && list.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4 px-1">
          <span><span className="font-semibold text-gray-700">{topLevel.length}</span> categoría{topLevel.length !== 1 ? 's' : ''}</span>
          <span><span className="font-semibold text-gray-700">{list.length - topLevel.length}</span> subcategoría{list.length - topLevel.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-gray-400 text-sm">Cargando categorías...</div>}

      {!isLoading && topLevel.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <FolderTree size={40} className="mx-auto mb-2 text-gray-300" />
          <div className="text-sm text-gray-400 mb-3">No hay categorías registradas</div>
          <button onClick={openCreateTop} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
            <Plus size={14} className="inline mr-1" /> Crear primera categoría
          </button>
        </div>
      )}

      {/* Tree */}
      <div className="space-y-2">
        {topLevel.map(cat => {
          const subs = subsByParent[cat.id] || [];
          const isOpen = expanded.has(cat.id);
          const catTotal = subs.reduce((acc, s) => acc + (productCountByCategory[s.id] || 0), 0) + (productCountByCategory[cat.id] || 0);
          return (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Category row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button
                  onClick={() => subs.length > 0 && toggleExpand(cat.id)}
                  className={`flex-shrink-0 text-gray-400 transition-colors ${subs.length > 0 ? 'hover:text-gray-600 cursor-pointer' : 'opacity-0 cursor-default'}`}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{cat.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {cat.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  {cat.description && (
                    <span className="text-xs text-gray-400 truncate block mt-0.5">{cat.description}</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:block">{subs.length} sub{subs.length !== 1 ? 's' : ''}</span>
                  {catTotal > 0 && (
                    <span className="text-xs bg-primary-100 text-primary-700 font-semibold px-2 py-0.5 rounded-full">{catTotal} prod.</span>
                  )}
                  <button
                    onClick={() => openCreateSub(cat.id)}
                    title="Agregar subcategoría"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                    <Plus size={12} /> Sub
                  </button>
                  <button onClick={() => openEdit(cat)} title="Editar" className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget(cat)} title="Eliminar" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Subcategories */}
              {isOpen && subs.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  {subs.map((sub, idx) => (
                    <div key={sub.id}
                      className={`flex items-center gap-3 px-4 py-2.5 pl-8 sm:pl-12 ${idx < subs.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <Tag size={13} className="text-gray-300 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-gray-700">{sub.name}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${sub.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {sub.isActive ? 'Activa' : 'Inactiva'}
                          </span>
                          {(productCountByCategory[sub.id] || 0) > 0 && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {productCountByCategory[sub.id]} prod.
                            </span>
                          )}
                        </div>
                        {sub.description && (
                          <span className="text-xs text-gray-400 truncate block mt-0.5">{sub.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(sub)} title="Editar" className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(sub)} title="Eliminar" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal crear/editar */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editing ? `Editar ${editing.parentId ? 'Subcategoría' : 'Categoría'}` : (form.parentId ? `Nueva Subcategoría de "${getParentName(form.parentId)}"` : 'Nueva Categoría')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {form.parentId && !editing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
              <FolderTree size={13} />
              <span>Subcategoría de <strong>{getParentName(form.parentId)}</strong></span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400"
              placeholder={form.parentId ? 'Ej: Herbicidas selectivos' : 'Ej: Fertilizantes'}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400"
              placeholder="Descripción breve..."
            />
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Activa</label>
            </div>
          )}
          <button type="submit" disabled={isPending}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium text-sm transition-colors">
            {isPending ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear')}
          </button>
        </form>
      </Modal>

      {/* Modal eliminar */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar">
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            ¿Eliminar <strong>{deleteTarget?.name}</strong>
            {deleteTarget?.parentId && <span className="text-gray-400"> (subcategoría)</span>}?
            {!deleteTarget?.parentId && subsByParent[deleteTarget?.id || '']?.length > 0 && (
              <span className="block mt-2 text-amber-600 text-xs">
                Atención: esta categoría tiene {subsByParent[deleteTarget?.id || ''].length} subcategoría(s). Elimínalas primero o quedarán huérfanas.
              </span>
            )}
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">Cancelar</button>
            <button
              onClick={async () => { if (deleteTarget) { await deleteCategory.mutateAsync(deleteTarget.id); setDeleteTarget(null); } }}
              disabled={deleteCategory.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
              {deleteCategory.isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
