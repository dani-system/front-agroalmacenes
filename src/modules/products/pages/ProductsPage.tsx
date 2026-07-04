import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useProductLots, useCreateProductLot, useUploadProductImage, useUpdateProductLot } from '../hooks/useProducts';
import { productService } from '../services/productService';
import { categoryService } from '../../categories/services/categoryService';
import { usePriceTiers } from '../../price-tiers/hooks/usePriceTiers';
import { useCategories } from '../../categories/hooks/useCategories';
import { useUnits } from '../../units/hooks/useUnits';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { DataTable } from '../../../shared/components/DataTable';
import { Modal } from '../../../shared/components/Modal';
import { Pagination } from '../../../shared/components/Pagination';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, Copy, X, Layers, Download, Upload, Truck, Package, Camera, Image, SlidersHorizontal, Check, Pencil, PowerOff } from 'lucide-react';
import { ProductSuppliersModal } from '../components/ProductSuppliersModal';
import { stockService } from '../../stock/services/stockService';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import type { Product } from '../../../shared/types';

const TAX_TYPES = [
  { value: 'GRAVADO', label: 'Gravado (IGV 18%)' },
  { value: 'EXONERADO', label: 'Exonerado' },
  { value: 'INAFECTO', label: 'Inafecto' },
];

interface BulkProduct {
  name: string;
  description: string;
  categoryId: string;
  unit: string;
  taxType: string;
  location: string;
  activeIngredient: string;
  activeIngredients: { name: string; concentration: string }[];
  tracksLot: boolean;
  prices: { priceTierId: string; companyId?: string; price: number }[];
  initialStocks: { companyId: string; quantity: number }[];
  expanded: boolean;
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');
  const activeTab = (searchParams.get('tab') || 'active') as 'active' | 'inactive';
  const sortOrder = (searchParams.get('sort') || '') as '' | 'asc' | 'desc';
  const unitFilter = searchParams.get('unit') || '';
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [activeIngredientFilter, setActiveIngredientFilter] = useState(searchParams.get('ing') || '');
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get('sup') || '');
  const [showFilters, setShowFilters] = useState(
    !!(searchParams.get('ing') || searchParams.get('sup') || searchParams.get('unit') || searchParams.get('sort'))
  );
  const debouncedSearch = useDebounce(search);
  const debouncedIngredient = useDebounce(activeIngredientFilter);
  const debouncedSupplier = useDebounce(supplierFilter);

  const setParams = (updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    }, { replace: true });
  };
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [priceCompanyFilter, setPriceCompanyFilter] = useState('');
  const [lotsTarget, setLotsTarget] = useState<Product | null>(null);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lotForm, setLotForm] = useState({ companyId: '', lotNumber: '', expirationDate: '', quantity: '' });

  const queryClient = useQueryClient();
  const { data, isLoading } = useProducts({ page, limit: 20, search: debouncedSearch, activeIngredient: debouncedIngredient || undefined, isActive: activeTab === 'active', supplier: debouncedSupplier || undefined, unit: unitFilter || undefined, sort: sortOrder || undefined });
  const { data: priceTiers } = usePriceTiers();
  const { data: categories } = useCategories();
  const { data: companies } = useCompanies();
  const { data: unitsData } = useUnits();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const uploadImage = useUploadProductImage();
  const { data: lotsData, isLoading: lotsLoading } = useProductLots(lotsTarget?.id || null);
  const createLot = useCreateProductLot();
  const updateLot = useUpdateProductLot();
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editingLotData, setEditingLotData] = useState<{ lotNumber: string; expirationDate: string }>({ lotNumber: '', expirationDate: '' });

  const stockQueries = useQueries({
    queries: (Array.isArray(companies) ? companies : [])
      .filter((c: any) => c.isActive)
      .map((c: any) => ({
        queryKey: ['stock', c.id, { limit: 9999 }],
        queryFn: () => stockService.getByCompany(c.id, { limit: 9999 }),
        staleTime: 60_000,
      })),
  });

  const stockMap = useMemo(() => {
    const activeCompanies = (Array.isArray(companies) ? companies : []).filter((c: any) => c.isActive);
    const map: Record<string, { companyId: string; quantity: number }[]> = {};
    activeCompanies.forEach((c: any, i: number) => {
      const q = stockQueries[i];
      if (!q?.data) return;
      const items: any[] = (q.data as any)?.data || [];
      items.forEach((s: any) => {
        if (!map[s.productId]) map[s.productId] = [];
        map[s.productId].push({ companyId: c.id, quantity: s.quantity });
      });
    });
    return map;
  }, [companies, stockQueries]);

  const [form, setForm] = useState({ name: '', description: '', categoryId: '', unit: '', activeIngredient: '', activeIngredients: [] as { name: string; concentration: string }[], taxType: 'GRAVADO', tracksLot: false, location: '', supplier: '', control: '', cultivo: '', dosis: '', prices: [] as { priceTierId: string; companyId?: string; price: number }[], initialStocks: [] as { companyId: string; quantity: number }[] });
  const [selectedParentCatId, setSelectedParentCatId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [suppliersTarget, setSuppliersTarget] = useState<Product | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProducts, setBulkProducts] = useState<BulkProduct[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<{ file: File; toCreate: string[]; toUpdate: string[]; newCategories: string[]; newSubcategories: { name: string; catName: string }[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const allUnits: { value: string; label: string }[] = Array.isArray(unitsData)
    ? unitsData.filter((u: any) => u.isActive).map((u: any) => ({ value: u.name, label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name }))
    : [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const scrollable = el.querySelector('.overflow-x-auto') as HTMLElement | null;
      if (scrollable) scrollable.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const isMounted = useRef(false);
  useEffect(() => { isMounted.current = true; }, []);

  useEffect(() => {
    if (!isMounted.current) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (debouncedSearch) next.set('q', debouncedSearch); else next.delete('q');
      next.delete('page');
      return next;
    }, { replace: true });
  }, [debouncedSearch]);

  useEffect(() => {
    if (!isMounted.current) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (debouncedIngredient) next.set('ing', debouncedIngredient); else next.delete('ing');
      next.delete('page');
      return next;
    }, { replace: true });
  }, [debouncedIngredient]);

  useEffect(() => {
    if (!isMounted.current) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (debouncedSupplier) next.set('sup', debouncedSupplier); else next.delete('sup');
      next.delete('page');
      return next;
    }, { replace: true });
  }, [debouncedSupplier]);

  const emptyBulkProduct = (): BulkProduct => ({ name: '', description: '', categoryId: '', unit: '', taxType: 'GRAVADO', location: '', activeIngredient: '', activeIngredients: [], tracksLot: false, prices: [], initialStocks: [], expanded: true });


  const openCreate = () => { setEditing(null); setSelectedParentCatId(''); setForm({ name: '', description: '', categoryId: '', unit: allUnits[0]?.value || '', activeIngredient: '', activeIngredients: [], taxType: 'GRAVADO', tracksLot: false, location: '', supplier: '', control: '', cultivo: '', dosis: '', prices: [], initialStocks: [] }); setShowModal(true); };
  const openEdit = (product: Product) => {
    setEditing(product);
    const cat = cats.find((c: any) => c.id === product.categoryId);
    setSelectedParentCatId(cat?.parentId ? cat.parentId : (cat?.id || ''));
    setForm({ name: product.name, description: product.description || '', categoryId: product.categoryId, unit: product.unit, activeIngredient: product.activeIngredient || '', activeIngredients: product.activeIngredients?.map(i => ({ name: i.name, concentration: i.concentration || '' })) || [], taxType: product.taxType || 'GRAVADO', tracksLot: product.tracksLot || false, location: product.location || '', supplier: product.supplier || '', control: product.control || '', cultivo: product.cultivo || '', dosis: product.dosis || '', prices: product.prices || [], initialStocks: [] });
    setShowModal(true);
  };
  const openBulk = () => { setBulkProducts([emptyBulkProduct()]); setShowBulkModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validIngredients = form.activeIngredients.filter(i => i.name.trim());
    if (editing) {
      const { initialStocks, activeIngredient, ...editData } = form;
      await updateProduct.mutateAsync({ id: editing.id, data: { ...editData, activeIngredients: validIngredients } });
    } else {
      const payload: any = { name: form.name, description: form.description, categoryId: form.categoryId, unit: form.unit, taxType: form.taxType, tracksLot: form.tracksLot, location: form.location, supplier: form.supplier || undefined, control: form.control || undefined, cultivo: form.cultivo || undefined, dosis: form.dosis || undefined, prices: form.prices, activeIngredients: validIngredients };
      const validStocks = form.initialStocks.filter(s => s.quantity > 0 && s.companyId);
      if (validStocks.length > 0) payload.initialStocks = validStocks;
      await createProduct.mutateAsync(payload);
    }
    setShowModal(false);
  };

  const handleStockChange = (companyId: string, quantity: number) => {
    setForm(prev => {
      const stocks = [...prev.initialStocks];
      const idx = stocks.findIndex(s => s.companyId === companyId);
      if (idx >= 0) stocks[idx] = { companyId, quantity };
      else stocks.push({ companyId, quantity });
      return { ...prev, initialStocks: stocks };
    });
  };

  const handlePriceChange = (tierId: string, price: number, companyId?: string) => {
    setForm((prev) => {
      const prices = [...prev.prices];
      const idx = prices.findIndex((p) => p.priceTierId === tierId && (p.companyId || undefined) === companyId);
      if (idx >= 0) prices[idx] = { priceTierId: tierId, ...(companyId ? { companyId } : {}), price };
      else prices.push({ priceTierId: tierId, ...(companyId ? { companyId } : {}), price });
      return { ...prev, prices };
    });
  };

  const updateBulkProduct = (index: number, field: string, value: any) => {
    setBulkProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const updateBulkPrice = (index: number, tierId: string, price: number, companyId?: string) => {
    setBulkProducts(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const prices = [...p.prices];
      const idx = prices.findIndex(pr => pr.priceTierId === tierId && (pr.companyId || undefined) === companyId);
      if (idx >= 0) prices[idx] = { priceTierId: tierId, ...(companyId ? { companyId } : {}), price };
      else prices.push({ priceTierId: tierId, ...(companyId ? { companyId } : {}), price });
      return { ...p, prices };
    }));
  };

  const updateBulkStock = (index: number, companyId: string, quantity: number) => {
    setBulkProducts(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const stocks = [...p.initialStocks];
      const idx = stocks.findIndex(s => s.companyId === companyId);
      if (idx >= 0) stocks[idx] = { companyId, quantity };
      else stocks.push({ companyId, quantity });
      return { ...p, initialStocks: stocks };
    }));
  };

  const removeBulkProduct = (index: number) => {
    setBulkProducts(prev => prev.filter((_, i) => i !== index));
  };

  const duplicateBulkProduct = (index: number) => {
    setBulkProducts(prev => {
      const copy = { ...prev[index], prices: [...prev[index].prices], name: prev[index].name + ' (copia)', expanded: true };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const toggleExpand = (index: number) => {
    setBulkProducts(prev => prev.map((p, i) => i === index ? { ...p, expanded: !p.expanded } : p));
  };

  const handleBulkSubmit = async () => {
    const valid = bulkProducts.filter(p => p.name && p.categoryId);
    if (valid.length === 0) { toast.error('Agrega al menos un producto con nombre y categoría'); return; }
    setBulkLoading(true);
    let created = 0;
    let errors = 0;
    for (const p of valid) {
      try {
        const payload: any = { name: p.name, description: p.description, categoryId: p.categoryId, unit: p.unit, taxType: p.taxType, prices: p.prices, activeIngredient: p.activeIngredient || undefined, location: p.location || undefined, tracksLot: p.tracksLot };
        const validStocks = p.initialStocks.filter(s => s.quantity > 0 && s.companyId);
        if (validStocks.length > 0) payload.initialStocks = validStocks;
        await createProduct.mutateAsync(payload);
        created++;
      } catch { errors++; }
    }
    setBulkLoading(false);
    toast.success(`${created} producto(s) creado(s)${errors > 0 ? `, ${errors} con error` : ''}`);
    if (created > 0) setShowBulkModal(false);
  };

  const handleExport = async () => {
    try {
      const allData = await productService.getAll({ page: 1, limit: 9999 });
      const allProducts: Product[] = allData?.data || allData || [];
      const tiersList = Array.isArray(priceTiers) ? priceTiers : [];
      const catsList = Array.isArray(categories) ? categories : [];
      const compsList = Array.isArray(companies) ? companies : [];

      const rows = allProducts.map((p: Product) => {
        const cat = catsList.find((c: any) => c.id === p.categoryId);
        const parent = cat?.parentId ? catsList.find((c: any) => c.id === cat.parentId) : null;
        const catLabel = parent ? `${parent.name} > ${cat?.name}` : (cat?.name || '');

        const ingredients = p.activeIngredients?.length
          ? p.activeIngredients.map((i: any) => i.concentration ? `${i.name} (${i.concentration})` : i.name).join(' | ')
          : (p.activeIngredient || '');

        const row: any = {
          Nombre: p.name,
          Unidad: p.unit,
          Ingrediente_Activo: ingredients,
          Categoria: catLabel,
          Ubicacion: p.location || '',
          Proveedor: p.supplier || '',
          Control: p.control || '',
          Cultivo: p.cultivo || '',
          Dosis: p.dosis || '',
          Tipo_IGV: p.taxType || 'GRAVADO',
        };

        tiersList.forEach((t: any) => {
          const globalPrice = p.prices?.find(pr => pr.priceTierId === t.id && !pr.companyId);
          row[`Precio_${t.name}`] = globalPrice?.price ?? '';
        });
        compsList.forEach((c: any) => {
          tiersList.forEach((t: any) => {
            const companyPrice = p.prices?.find(pr => pr.priceTierId === t.id && pr.companyId === c.id);
            row[`Precio_${c.name}_${t.name}`] = companyPrice?.price ?? '';
          });
        });

        row['Estado'] = p.isActive ? 'Activo' : 'Inactivo';
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      XLSX.writeFile(wb, `productos_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`${allProducts.length} producto(s) exportado(s)`);
    } catch { toast.error('Error al exportar'); }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (allRows.length < 2) { toast.error('El archivo está vacío'); return; }

        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(allRows.length, 5); i++) {
          if (allRows[i].some((c: any) => String(c).trim() !== '')) { headerRowIdx = i; break; }
        }
        const rawHeaders: string[] = allRows[headerRowIdx].map((h: any) => String(h ?? ''));
        const dataRows: any[][] = allRows.slice(headerRowIdx + 1).filter(r => r.some((c: any) => String(c).trim() !== ''));

        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
        const findCol = (...candidates: string[]): number => {
          const nh = rawHeaders.map(norm);
          for (const c of candidates) { const n = norm(c); if (!n) continue; const i = nh.findIndex(h => h === n); if (i !== -1) return i; }
          for (const c of candidates) { const n = norm(c); if (!n) continue; const i = nh.findIndex(h => h.length > 0 && (h.includes(n) || n.includes(h))); if (i !== -1) return i; }
          return -1;
        };
        const getVal = (row: any[], idx: number) => idx === -1 ? '' : String(row[idx] ?? '').trim();

        const nameIdx = findCol('nombre producto', 'nombre de producto');
        const isClientFormat = nameIdx !== -1;

        if (isClientFormat) {
          // ── Formato del cliente: generar preview y enviar al backend ──
          const catIdx    = findCol('categoria');
          const subCatIdx = findCol('sub categoria', 'subcategoria');

          const allExistingData = await productService.getAll({ page: 1, limit: 9999 });
          const existingNames = new Set<string>((allExistingData?.data || allExistingData || []).map((p: any) => p.name.toLowerCase().trim()));

          const catsList: any[] = Array.isArray(categories) ? categories : [];
          const parentCats = catsList.filter((c: any) => !c.parentId);
          const subCats = catsList.filter((c: any) => c.parentId);

          const toCreate: string[] = [];
          const toUpdate: string[] = [];
          const newCategories: string[] = [];
          const newSubcategories: { name: string; catName: string }[] = [];
          const notedNewCats = new Set<string>();
          const notedNewSubs = new Set<string>();

          dataRows.forEach(row => {
            const name = String(row[nameIdx] ?? '').trim();
            if (!name) return;
            if (existingNames.has(name.toLowerCase())) toUpdate.push(name);
            else toCreate.push(name);

            const catName = getVal(row, catIdx);
            if (catName) {
              const catExists = parentCats.find((c: any) => c.name.toLowerCase() === catName.toLowerCase());
              if (!catExists && !notedNewCats.has(catName.toLowerCase())) {
                newCategories.push(catName);
                notedNewCats.add(catName.toLowerCase());
              }
              const subCatName = getVal(row, subCatIdx);
              if (subCatName) {
                const subKey = `${catName.toLowerCase()}::${subCatName.toLowerCase()}`;
                const parentId = catExists?.id;
                const subExists = parentId
                  ? subCats.find((c: any) => c.parentId === parentId && c.name.toLowerCase() === subCatName.toLowerCase())
                  : false;
                if (!subExists && !notedNewSubs.has(subKey)) {
                  newSubcategories.push({ name: subCatName, catName });
                  notedNewSubs.add(subKey);
                }
              }
            }
          });

          setImportPreview({ file, toCreate, toUpdate, newCategories, newSubcategories });
          setShowImportModal(true);
        } else {
          // ── Formato plantilla estándar (columnas ASCII) ──────────────────
          const rows: any[] = XLSX.utils.sheet_to_json(ws);
          const tiersList = Array.isArray(priceTiers) ? priceTiers : [];
          const compsList = Array.isArray(companies) ? companies : [];
          let catsList: any[] = Array.isArray(categories) ? [...categories] : [];

          const uniqueCats = [...new Set(rows.map(r => String(r.Categoria || '').trim()).filter(Boolean))];
          let createdCats = 0;
          for (const catName of uniqueCats) {
            if (!catsList.find((c: any) => c.name?.toLowerCase() === catName.toLowerCase())) {
              try { const nc = await categoryService.create({ name: catName }); catsList.push(nc); createdCats++; }
              catch { /* ya existe */ }
            }
          }
          if (createdCats > 0) {
            await queryClient.invalidateQueries({ queryKey: ['categories'] });
            toast.success(`${createdCats} categoría(s) creada(s)`);
          }

          const imported: BulkProduct[] = rows.map(row => {
            const cat = catsList.find((c: any) => c.name?.toLowerCase() === String(row.Categoria || '').trim().toLowerCase());
            const prices: { priceTierId: string; companyId?: string; price: number }[] = [];
            tiersList.forEach((t: any) => { const val = row[`Precio_${t.name}`]; prices.push({ priceTierId: t.id, price: Number(val) || 0 }); });
            compsList.forEach((c: any) => { tiersList.forEach((t: any) => { const val = row[`Precio_${c.name}_${t.name}`]; if (val && Number(val) > 0) prices.push({ priceTierId: t.id, companyId: c.id, price: Number(val) }); }); });
            const initialStocks: { companyId: string; quantity: number }[] = [];
            compsList.forEach((c: any) => { const val = row[`Stock_${c.name}`]; if (val && Number(val) > 0) initialStocks.push({ companyId: c.id, quantity: Number(val) }); });
            const rawTaxType = String(row.Tipo_IGV || '').trim().toUpperCase();
            return { name: String(row.Nombre || ''), description: String(row.Descripcion || ''), categoryId: cat?.id || '', unit: String(row.Unidad || ''), taxType: ['GRAVADO', 'EXONERADO', 'INAFECTO'].includes(rawTaxType) ? rawTaxType : 'GRAVADO', location: String(row.Ubicacion || '').trim(), activeIngredient: String(row.IngredienteActivo || '').trim(), activeIngredients: [], tracksLot: false, prices, initialStocks, expanded: false };
          });
          toast.success(`${imported.length} producto(s) cargados desde Excel`);
          setBulkProducts(imported);
          setShowBulkModal(true);
        }
      } catch (err) {
        console.error('Import error:', err);
        toast.error('Error al leer el archivo. Revisa la consola del navegador para más detalles.');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    setImportLoading(true);
    try {
      const raw = await productService.importExcel(importPreview.file);
      const result = (raw as any).data ?? raw;
      const created: number = result.created ?? 0;
      const updated: number = result.updated ?? 0;
      const errors: string[] = result.errors ?? [];
      toast.success(`Importación completa: ${created} creado(s), ${updated} actualizado(s)`);
      if (errors.length > 0) {
        toast.error(`${errors.length} error(es): ${errors.slice(0, 2).join('; ')}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowImportModal(false);
      setImportPreview(null);
    } catch {
      toast.error('Error al importar el archivo');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const tiersList = Array.isArray(priceTiers) ? priceTiers : [];
    const catsList = Array.isArray(categories) ? categories : [];
    const compsList = Array.isArray(companies) ? companies : [];
    const header: any = { Nombre: 'Ejemplo Producto', Descripcion: '', Categoria: catsList[0]?.name || 'Fertilizantes', Unidad: 'kg', IngredienteActivo: '', Ubicacion: '', Tipo_IGV: 'GRAVADO' };
    tiersList.forEach((t: any) => { header[`Precio_${t.name}`] = 0; });
    compsList.forEach((c: any) => { tiersList.forEach((t: any) => { header[`Precio_${c.name}_${t.name}`] = 0; }); });
    compsList.forEach((c: any) => { header[`Stock_${c.name}`] = 0; });

    const ws = XLSX.utils.json_to_sheet([header]);
    const catNames = catsList.filter((c: any) => c.isActive).map((c: any) => c.name).join(', ');
    const unitNames = allUnits.map(u => u.value).join(', ');
    XLSX.utils.sheet_add_aoa(ws, [[`Categorías válidas: ${catNames}`], [`Unidades disponibles: ${unitNames} (o cualquier otra, se agrega automáticamente)`], [`Tipo_IGV válidos: GRAVADO, EXONERADO, INAFECTO`]], { origin: `A${3}` });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'plantilla_productos.xlsx');
  };

  const products = data?.data || [];
  const total = data?.total || 0;
  const tiers = Array.isArray(priceTiers) ? priceTiers : [];
  const cats = Array.isArray(categories) ? categories : [];
  const comps = Array.isArray(companies) ? companies : [];

  const getPricesForDisplay = (product: Product) => {
    if (!priceCompanyFilter) {
      return product.prices?.filter(p => !p.companyId) || [];
    }
    return tiers.map((t: any) => {
      const companyPrice = product.prices?.find(p => p.priceTierId === t.id && p.companyId === priceCompanyFilter);
      if (companyPrice) return companyPrice;
      const globalPrice = product.prices?.find(p => p.priceTierId === t.id && !p.companyId);
      return globalPrice || null;
    }).filter(Boolean) as typeof product.prices;
  };

  const columns = [
    { key: 'name', header: 'Nombre', render: (item: Product) => {
      const itemStocks = stockMap[item.id] || [];
      const activeCompsList = comps.filter((c: any) => c.isActive);
      return (
        <div>
          <span className="block max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap" title={item.name}>{item.name}</span>
          {activeCompsList.length > 0 && (
            <div className="flex gap-1 mt-1">
              {activeCompsList.map((c: any) => {
                const s = itemStocks.find((st) => st.companyId === c.id);
                const qty = s?.quantity ?? 0;
                const dotCls = qty > 10 ? 'bg-green-500' : qty > 0 ? 'bg-yellow-400' : 'bg-red-500';
                return <span key={c.id} className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} title={`${c.name}: ${qty}`} />;
              })}
            </div>
          )}
        </div>
      );
    }},
    { key: 'unit', header: 'Unidad' },
    { key: 'activeIngredients', header: 'Ingrediente Activo', render: (item: Product) => {
      const ings = item.activeIngredients?.length ? item.activeIngredients : item.activeIngredient ? [{ name: item.activeIngredient, concentration: '' }] : [];
      if (!ings.length) return <span className="text-gray-300">—</span>;
      const fullText = ings.map(i => i.name + (i.concentration ? ` (${i.concentration})` : '')).join(' | ');
      const visible = ings.slice(0, 2);
      return (
        <div className="max-w-[200px]" title={fullText}>
          <div className="flex flex-wrap gap-1">
            {visible.map((i, idx) => (
              <span key={idx} className="block max-w-[190px] overflow-hidden text-ellipsis whitespace-nowrap text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                {i.name}{i.concentration ? ` (${i.concentration})` : ''}
              </span>
            ))}
            {ings.length > 2 && <span className="text-xs text-gray-400 self-center">+{ings.length - 2}</span>}
          </div>
        </div>
      );
    }},
    { key: 'categoryId', header: 'Categoría', render: (item: Product) => {
      const cat = cats.find((c: any) => c.id === item.categoryId);
      if (!cat) return <span className="text-gray-400 text-xs">{item.categoryId}</span>;
      if (cat.parentId) {
        const parent = cats.find((c: any) => c.id === cat.parentId);
        return <span className="text-xs"><span className="text-gray-400">{parent?.name || '?'} › </span>{cat.name}</span>;
      }
      return cat.name;
    }},
    { key: 'location', header: 'Ubicación', render: (item: Product) => item.location
      ? <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{item.location}</span>
      : <span className="text-gray-300">—</span>
    },
    { key: 'supplier', header: 'Proveedor', render: (item: Product) => item.supplier ? <span className="text-xs text-gray-700">{item.supplier}</span> : <span className="text-gray-300">—</span> },
    { key: 'control', header: 'Control', render: (item: Product) => item.control ? <span className="text-xs text-gray-700">{item.control}</span> : <span className="text-gray-300">—</span> },
    { key: 'cultivo', header: 'Cultivo', render: (item: Product) => item.cultivo ? <span className="text-xs text-gray-700">{item.cultivo}</span> : <span className="text-gray-300">—</span> },
    { key: 'dosis', header: 'Dosis', render: (item: Product) => item.dosis ? <span className="text-xs text-gray-700">{item.dosis}</span> : <span className="text-gray-300">—</span> },
    { key: 'taxType', header: 'IGV', render: (item: Product) => {
      const t = TAX_TYPES.find(tx => tx.value === (item.taxType || 'GRAVADO'));
      const colors = item.taxType === 'EXONERADO' ? 'bg-yellow-100 text-yellow-800' : item.taxType === 'INAFECTO' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800';
      return <span className={`px-2 py-1 rounded-full text-xs ${colors}`}>{t?.label || 'Gravado'}</span>;
    }},
    { key: 'prices', header: 'Precios', render: (item: Product) => {
      const displayPrices = getPricesForDisplay(item);
      return (
        <div className="text-xs space-y-1">
          {displayPrices.map((p) => {
            const tier = tiers.find((t: any) => t.id === p.priceTierId);
            const isCompanySpecific = !!p.companyId;
            return (
              <div key={`${p.priceTierId}-${p.companyId || 'global'}`}>
                <span className="font-medium">{tier?.name || 'N/A'}:</span> S/ {p.price.toFixed(2)}
                {priceCompanyFilter && !isCompanySpecific && <span className="text-gray-400 ml-1">(global)</span>}
              </div>
            );
          })}
        </div>
      );
    }},
    { key: 'isActive', header: 'Estado', render: (item: Product) => <span className={`px-2 py-1 rounded-full text-xs ${item.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>{item.isActive ? 'Activo' : 'Inactivo'}</span> },
    { key: 'actions', header: 'Acciones', render: (item: Product) => (
      <div className="flex gap-2">
        {activeTab === 'active' && <button onClick={() => setSuppliersTarget(item)} className="text-gray-500 hover:text-primary-600" title="Ver proveedores"><Truck size={16} /></button>}
        {activeTab === 'active' && item.tracksLot && <button onClick={() => setLotsTarget(item)} className="text-purple-600 hover:text-purple-800" title="Ver lotes"><Package size={16} /></button>}
        {activeTab === 'active' && <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800" title="Editar"><Edit2 size={16} /></button>}
        {activeTab === 'active'
          ? <button onClick={() => setDeleteTarget(item)} className="text-red-600 hover:text-red-800" title="Desactivar"><Trash2 size={16} /></button>
          : <button onClick={() => updateProduct.mutateAsync({ id: item.id, data: { isActive: true } })} className="text-green-600 hover:text-green-800 text-xs font-medium px-2 py-1 border border-green-300 rounded-lg" title="Reactivar">Reactivar</button>
        }
      </div>
    )},
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-800">Productos</h1>
            {data?.total !== undefined && (
              <span className="px-2.5 py-0.5 bg-primary-100 text-primary-700 text-sm font-semibold rounded-full">
                {data.total.toLocaleString()} {activeTab === 'active' ? 'activos' : 'desactivados'}
              </span>
            )}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button onClick={() => setParams({ tab: 'active', page: '' })} className={`px-3 py-1 font-medium transition-colors ${activeTab === 'active' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Activos</button>
              <button onClick={() => setParams({ tab: 'inactive', page: '' })} className={`px-3 py-1 font-medium transition-colors ${activeTab === 'inactive' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Desactivados</button>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
            <Plus size={16} /> <span className="hidden sm:inline">Nuevo Producto</span><span className="sm:hidden">Nuevo</span>
          </button>
        </div>
        {/* Secondary actions — scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap flex-shrink-0"><Download size={15} /> Exportar</button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap flex-shrink-0"><Upload size={15} /> Importar</button>
          <button onClick={openBulk} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap flex-shrink-0"><Layers size={15} /> Carga Masiva</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 space-y-2">
        {/* Fila principal: buscador + botón filtros (mobile) */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar productos..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
          </div>
          {/* Botón filtros — solo mobile */}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`lg:hidden flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${showFilters ? 'bg-primary-600 text-white border-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <SlidersHorizontal size={15} />
            {(() => {
              const n = [activeIngredientFilter, supplierFilter, unitFilter, sortOrder, priceCompanyFilter].filter(Boolean).length;
              return n > 0 ? <span className={`text-xs font-bold ${showFilters ? 'text-white' : 'text-primary-600'}`}>{n}</span> : null;
            })()}
          </button>
        </div>

        {/* Panel de filtros adicionales: siempre visible en desktop, toggle en mobile */}
        <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col gap-2`}>
          {/* Fila A: ingrediente activo + empresa precios */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Ingrediente activo..." value={activeIngredientFilter} onChange={(e) => setActiveIngredientFilter(e.target.value)} className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
            </div>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Proveedor..." value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
            </div>
          </div>
          {/* Fila B: orden + unidad + empresa precios */}
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <select value={sortOrder} onChange={(e) => setParams({ sort: e.target.value, page: '' })} className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm">
              <option value="">Más reciente</option>
              <option value="asc">Nombre A → Z</option>
              <option value="desc">Nombre Z → A</option>
            </select>
            {allUnits.length > 0 && (
              <select value={unitFilter} onChange={(e) => setParams({ unit: e.target.value, page: '' })} className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm">
                <option value="">Todas las unidades</option>
                {allUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            )}
            {comps.length > 0 && (
              <select value={priceCompanyFilter} onChange={(e) => setPriceCompanyFilter(e.target.value)} className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm">
                <option value="">Precio global</option>
                {comps.filter((c: any) => c.isActive).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile cards ── */}
      <div className="lg:hidden space-y-3">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Sin productos</div>
        ) : (products as Product[]).map((item: Product) => {
          const cat = cats.find((c: any) => c.id === item.categoryId);
          const catLabel = cat
            ? (cat.parentId ? `${cats.find((c: any) => c.id === cat.parentId)?.name || '?'} › ${cat.name}` : cat.name)
            : null;
          const ings = item.activeIngredients?.length
            ? item.activeIngredients
            : item.activeIngredient ? [{ name: item.activeIngredient, concentration: '' }] : [];
          const displayPrices = getPricesForDisplay(item);
          const taxColor = item.taxType === 'EXONERADO'
            ? 'bg-yellow-100 text-yellow-800'
            : item.taxType === 'INAFECTO' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800';
          const taxLabel = TAX_TYPES.find(t => t.value === (item.taxType || 'GRAVADO'))?.label || 'Gravado';
          return (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              {/* Name + status */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <span className="font-semibold text-gray-800 leading-snug">{item.name}</span>
                  {(() => {
                    const activeCompsList = comps.filter((c: any) => c.isActive);
                    if (!activeCompsList.length) return null;
                    const itemStocks = stockMap[item.id] || [];
                    return (
                      <div className="flex gap-1 mt-0.5">
                        {activeCompsList.map((c: any) => {
                          const s = itemStocks.find((st) => st.companyId === c.id);
                          const qty = s?.quantity ?? 0;
                          const dotCls = qty > 10 ? 'bg-green-500' : qty > 0 ? 'bg-yellow-400' : 'bg-red-500';
                          return <span key={c.id} className={`w-2 h-2 rounded-full ${dotCls}`} title={`${c.name}: ${qty}`} />;
                        })}
                      </div>
                    );
                  })()}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${item.isActive ? 'bg-primary-100 text-primary-800' : 'bg-red-100 text-red-800'}`}>
                  {item.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {/* Category */}
              {catLabel && <div className="text-xs text-gray-500 mb-2">{catLabel}</div>}

              {/* Active ingredients */}
              {ings.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {ings.map((ing, idx) => (
                    <span key={idx} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                      {ing.name}{ing.concentration ? ` (${ing.concentration})` : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Unit / Location / IGV */}
              <div className="flex items-center flex-wrap gap-1.5 mb-2">
                <span className="text-xs text-gray-500">Unidad: <span className="font-medium text-gray-700">{item.unit}</span></span>
                {item.location && (
                  <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{item.location}</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${taxColor}`}>{taxLabel}</span>
              </div>
              {(item.supplier || item.control || item.cultivo || item.dosis) && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-xs text-gray-500">
                  {item.supplier && <span>Prov.: <span className="font-medium text-gray-700">{item.supplier}</span></span>}
                  {item.control && <span>Control: <span className="font-medium text-gray-700">{item.control}</span></span>}
                  {item.cultivo && <span>Cultivo: <span className="font-medium text-gray-700">{item.cultivo}</span></span>}
                  {item.dosis && <span>Dosis: <span className="font-medium text-gray-700">{item.dosis}</span></span>}
                </div>
              )}

              {/* Prices */}
              {displayPrices.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-3 text-xs text-gray-600 border-t border-gray-100 pt-2">
                  {displayPrices.map(p => {
                    const tier = tiers.find((t: any) => t.id === p.priceTierId);
                    return (
                      <span key={`${p.priceTierId}-${p.companyId || 'g'}`}>
                        <span className="font-medium">{tier?.name}:</span> S/ {p.price.toFixed(2)}
                        {priceCompanyFilter && !p.companyId && <span className="text-gray-400"> (global)</span>}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              {activeTab === 'active' ? (
                <div className={`grid ${item.tracksLot ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                  <button onClick={() => setSuppliersTarget(item)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                    <Truck size={13} /> Prov.
                  </button>
                  {item.tracksLot && (
                    <button onClick={() => setLotsTarget(item)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                      <Package size={13} /> Lotes
                    </button>
                  )}
                  <button onClick={() => openEdit(item)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                    <Edit2 size={13} /> Editar
                  </button>
                  <button onClick={() => setDeleteTarget(item)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <Trash2 size={13} /> Desact.
                  </button>
                </div>
              ) : (
                <button onClick={() => updateProduct.mutateAsync({ id: item.id, data: { isActive: true } })} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors border border-green-200">
                  Reactivar producto
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desktop table ── */}
      <div ref={tableWrapperRef} className="hidden lg:block">
        <DataTable columns={columns} data={products} isLoading={isLoading} />
      </div>

      <Pagination page={page} totalPages={Math.ceil(total / 20)} onPageChange={(p) => setParams({ page: p > 1 ? String(p) : '' })} />
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Producto' : 'Nuevo Producto'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {editing && (
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex-shrink-0">
                {editing.imageUrl
                  ? <img src={editing.imageUrl} alt={editing.name} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  : <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300"><span className="text-2xl">📦</span></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 mb-2">Imagen del producto</div>

                {/* Mobile: botón Cámara + botón Galería */}
                <div className="flex gap-2 sm:hidden">
                  <button type="button" onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    <Camera size={13} /> Cámara
                  </button>
                  <button type="button" onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    <Image size={13} /> Galería
                  </button>
                </div>

                {/* Desktop: botón único */}
                <label className="hidden sm:inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  <span>📷</span> {editing.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage.mutate({ id: editing.id, file });
                    e.target.value = '';
                  }} />
                </label>

                {/* Inputs ocultos para mobile */}
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file) uploadImage.mutate({ id: editing.id, file }); e.target.value = ''; }} />
                <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file) uploadImage.mutate({ id: editing.id, file }); e.target.value = ''; }} />

                {uploadImage.isPending && <span className="text-xs text-gray-400 mt-1 block">Subiendo...</span>}
              </div>
            </div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Ingredientes Activos <span className="text-gray-400 font-normal">(opcional)</span></label>
              <button type="button" onClick={() => setForm({ ...form, activeIngredients: [...form.activeIngredients, { name: '', concentration: '' }] })} className="text-xs text-primary-600 hover:text-primary-800 font-medium">+ Agregar</button>
            </div>
            {form.activeIngredients.length === 0 && <p className="text-xs text-gray-400 italic">Sin ingredientes. Haz clic en "+ Agregar".</p>}
            <div className="space-y-2">
              {form.activeIngredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input value={ing.name} onChange={(e) => { const arr = [...form.activeIngredients]; arr[idx] = { ...arr[idx], name: e.target.value }; setForm({ ...form, activeIngredients: arr }); }} placeholder="Nombre (ej: Glifosato)" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  <input value={ing.concentration} onChange={(e) => { const arr = [...form.activeIngredients]; arr[idx] = { ...arr[idx], concentration: e.target.value }; setForm({ ...form, activeIngredients: arr }); }} placeholder="Conc. (ej: 480 g/L)" className="w-36 px-3 py-2 border rounded-lg text-sm" />
                  <button type="button" onClick={() => setForm({ ...form, activeIngredients: form.activeIngredients.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Ubicación <span className="text-gray-400 font-normal">(opcional)</span></label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ej: P 4 (a), Estante B-3..." className="w-full px-3 py-2 border rounded-lg" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Proveedor <span className="text-gray-400 font-normal">(se asigna al comprar)</span></label><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Nombre del proveedor..." className="w-full px-3 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Control <span className="text-gray-400 font-normal">(opcional)</span></label><input value={form.control} onChange={(e) => setForm({ ...form, control: e.target.value })} placeholder="Ej: Fungicida, Herbicida..." className="w-full px-3 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Cultivo <span className="text-gray-400 font-normal">(opcional)</span></label><input value={form.cultivo} onChange={(e) => setForm({ ...form, cultivo: e.target.value })} placeholder="Ej: Maíz, Arroz..." className="w-full px-3 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Dosis <span className="text-gray-400 font-normal">(opcional)</span></label><input value={form.dosis} onChange={(e) => setForm({ ...form, dosis: e.target.value })} placeholder="Ej: 2 L/ha, 200 g/200L..." className="w-full px-3 py-2 border rounded-lg" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              {(() => {
                const topLevelCats = cats.filter((c: any) => c.isActive && !c.parentId);
                const subCats = cats.filter((c: any) => c.isActive && c.parentId === selectedParentCatId);
                const hasSubCats = subCats.length > 0;
                return (
                  <div className="space-y-2">
                    <select
                      value={selectedParentCatId}
                      onChange={e => {
                        const pid = e.target.value;
                        setSelectedParentCatId(pid);
                        setForm(f => ({ ...f, categoryId: pid }));
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      required={!hasSubCats}
                    >
                      <option value="">Seleccionar categoría...</option>
                      {topLevelCats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {hasSubCats && (
                      <select
                        value={form.categoryId}
                        onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                        className="w-full px-3 py-2 border border-indigo-200 bg-indigo-50 rounded-lg text-sm"
                        required
                      >
                        <option value={selectedParentCatId}>— Sin subcategoría —</option>
                        {subCats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required>
                <option value="">Seleccionar...</option>
                {allUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo IGV</label><select value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value })} className="w-full px-3 py-2 border rounded-lg">{TAX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          {!editing && comps.length > 0 && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
              <label className="block text-sm font-medium text-blue-800">Stock Inicial por Empresa (opcional)</label>
              <p className="text-xs text-blue-600">Si ya tienes existencias de este producto, ingresa la cantidad por cada empresa.</p>
              <div className="space-y-2">
                {comps.filter((c: any) => c.isActive).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-sm w-40 truncate font-medium">{c.name}</span>
                    <input type="number" step="0.01" min="0" placeholder="0" value={form.initialStocks.find(s => s.companyId === c.id)?.quantity || ''} onChange={(e) => handleStockChange(c.id, parseFloat(e.target.value) || 0)} className="flex-1 px-3 py-2 border rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50/50">
            <input type="checkbox" id="tracksLot" checked={form.tracksLot} onChange={(e) => setForm({ ...form, tracksLot: e.target.checked })} className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 rounded" />
            <label htmlFor="tracksLot" className="text-sm cursor-pointer select-none">
              <span className="font-medium text-gray-800">Rastrea lote y vencimiento</span>
              <span className="block text-xs text-gray-500">Activa esta opción para productos perecibles o controlados. Al registrar compras se pedirá el lote y fecha de vencimiento.</span>
            </label>
          </div>

          {tiers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Precio por defecto <span className="text-xs font-normal text-gray-400">(se usa cuando no hay precio específico por empresa)</span></label>
              <div className="space-y-2">
                {tiers.map((tier: any) => (
                  <div key={tier.id} className="flex items-center gap-3">
                    <span className="text-sm w-32">{tier.name}</span>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={form.prices.find((p) => p.priceTierId === tier.id && !p.companyId)?.price || ''} onChange={(e) => handlePriceChange(tier.id, parseFloat(e.target.value) || 0)} className="flex-1 px-3 py-2 border rounded-lg" />
                  </div>
                ))}
              </div>
              {comps.filter((c: any) => c.isActive).map((company: any) => (
                <div key={company.id} className="mt-4 border border-orange-200 bg-orange-50 rounded-lg p-3">
                  <label className="block text-sm font-medium text-orange-800 mb-2">Precios para {company.name} (opcional)</label>
                  <div className="space-y-2">
                    {tiers.map((tier: any) => (
                      <div key={tier.id} className="flex items-center gap-3">
                        <span className="text-sm w-32">{tier.name}</span>
                        <input type="number" step="0.01" min="0" placeholder={`Global: ${form.prices.find((p: any) => p.priceTierId === tier.id && !p.companyId)?.price || '0.00'}`} value={form.prices.find((p: any) => p.priceTierId === tier.id && p.companyId === company.id)?.price || ''} onChange={(e) => handlePriceChange(tier.id, parseFloat(e.target.value) || 0, company.id)} className="flex-1 px-3 py-2 border rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="submit" disabled={editing ? updateProduct.isPending : createProduct.isPending} className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">{editing ? (updateProduct.isPending ? 'Actualizando...' : 'Actualizar') : (createProduct.isPending ? 'Creando...' : 'Crear')}</button>
        </form>
      </Modal>
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Desactivar Producto">
        <div className="space-y-4">
          <p className="text-gray-600">¿Deseas desactivar el producto <strong>{deleteTarget?.name}</strong>? No volverá a aparecer en listados ni en nuevas ventas, pero su historial se mantiene intacto.</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button onClick={async () => { if (deleteTarget) { await deleteProduct.mutateAsync(deleteTarget.id); setDeleteTarget(null); } }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Desactivar</button>
          </div>
        </div>
      </Modal>
      <ProductSuppliersModal product={suppliersTarget} onClose={() => setSuppliersTarget(null)} />

      {/* Modal Ver Lotes */}
      <Modal isOpen={!!lotsTarget} onClose={() => { setLotsTarget(null); setShowLotForm(false); setLotForm({ companyId: '', lotNumber: '', expirationDate: '', quantity: '' }); setEditingLotId(null); setEditingLotData({ lotNumber: '', expirationDate: '' }); }} title={`Lotes — ${lotsTarget?.name}`} size="lg">
        <div className="space-y-4">
          {/* Formulario agregar lote */}
          {!showLotForm ? (
            <button onClick={() => setShowLotForm(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200">
              <Plus size={15} /> Agregar lote
            </button>
          ) : (
            <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
              <div className="text-sm font-semibold text-purple-800 mb-1">Nuevo lote</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Empresa *</label>
                  <select value={lotForm.companyId} onChange={e => setLotForm(f => ({ ...f, companyId: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Seleccionar...</option>
                    {comps.filter((c: any) => c.isActive).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nro. de lote *</label>
                  <input value={lotForm.lotNumber} onChange={e => setLotForm(f => ({ ...f, lotNumber: e.target.value }))} placeholder="Ej: L-2024-001" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento <span className="text-gray-400">(opcional)</span></label>
                  <input type="date" value={lotForm.expirationDate} onChange={e => setLotForm(f => ({ ...f, expirationDate: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad *</label>
                  <input type="number" min="0.01" step="0.01" value={lotForm.quantity} onChange={e => setLotForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={async () => {
                    if (!lotsTarget || !lotForm.companyId || !lotForm.lotNumber || !lotForm.quantity) return;
                    await createLot.mutateAsync({ productId: lotsTarget.id, companyId: lotForm.companyId, lotNumber: lotForm.lotNumber, expirationDate: lotForm.expirationDate || undefined, quantity: parseFloat(lotForm.quantity) });
                    setShowLotForm(false);
                    setLotForm({ companyId: '', lotNumber: '', expirationDate: '', quantity: '' });
                  }}
                  disabled={createLot.isPending || !lotForm.companyId || !lotForm.lotNumber || !lotForm.quantity}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                  {createLot.isPending ? 'Guardando...' : 'Guardar lote'}
                </button>
                <button onClick={() => { setShowLotForm(false); setLotForm({ companyId: '', lotNumber: '', expirationDate: '', quantity: '' }); }} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de lotes */}
          {lotsLoading ? (
            <div className="py-6 text-center text-gray-400 text-sm">Cargando lotes...</div>
          ) : !lotsData || lotsData.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">Sin lotes registrados para este producto.</div>
          ) : (() => {
            const today = new Date();
            const getLotStatus = (lot: import('../../../shared/types').ProductLot) => {
              if (!lot.isActive) return { label: 'Inactivo', cls: 'bg-gray-100 text-gray-500' };
              if (lot.currentQuantity <= 0) return { label: 'Agotado', cls: 'bg-gray-100 text-gray-500' };
              if (!lot.expirationDate) return { label: 'Sin venc.', cls: 'bg-blue-100 text-blue-700' };
              const exp = new Date(lot.expirationDate);
              const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
              const expUTC = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
              const diff = Math.ceil((expUTC - todayUTC) / 86400000);
              if (diff < 0) return { label: 'Vencido', cls: 'bg-red-100 text-red-700' };
              if (diff <= 30) return { label: `Vence en ${diff}d`, cls: 'bg-yellow-100 text-yellow-700' };
              return { label: 'Vigente', cls: 'bg-green-100 text-green-700' };
            };
            const startEdit = (lot: import('../../../shared/types').ProductLot) => {
              setEditingLotId(lot.id!);
              setEditingLotData({
                lotNumber: lot.lotNumber,
                expirationDate: lot.expirationDate
                  ? new Date(lot.expirationDate).toISOString().slice(0, 10)
                  : '',
              });
            };
            const cancelEdit = () => { setEditingLotId(null); setEditingLotData({ lotNumber: '', expirationDate: '' }); };
            const saveEdit = async (lotId: string) => {
              await updateLot.mutateAsync({
                id: lotId,
                data: {
                  lotNumber: editingLotData.lotNumber,
                  expirationDate: editingLotData.expirationDate || null,
                },
              });
              cancelEdit();
            };
            const grouped: Record<string, typeof lotsData> = {};
            lotsData.forEach(lot => { if (!grouped[lot.companyId]) grouped[lot.companyId] = []; grouped[lot.companyId].push(lot); });
            return (
              <div className="space-y-4">
                {Object.entries(grouped).map(([cId, lots]) => {
                  const company = comps.find((c: any) => c.id === cId);
                  return (
                    <div key={cId}>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{company?.name || cId}</div>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs text-gray-500">
                            <tr>
                              <th className="px-3 py-2 text-left">Nro. Lote</th>
                              <th className="px-3 py-2 text-left">Vencimiento</th>
                              <th className="px-3 py-2 text-right">Inicial</th>
                              <th className="px-3 py-2 text-right">Actual</th>
                              <th className="px-3 py-2 text-left">Estado</th>
                              <th className="px-3 py-2 text-center">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {lots.map(lot => {
                              const st = getLotStatus(lot);
                              const isEditing = editingLotId === lot.id;
                              return (
                                <tr key={lot.id} className={`${!lot.isActive ? 'opacity-50' : ''} ${isEditing ? 'bg-purple-50' : ''}`}>
                                  <td className="px-3 py-2">
                                    {isEditing ? (
                                      <input
                                        value={editingLotData.lotNumber}
                                        onChange={e => setEditingLotData(d => ({ ...d, lotNumber: e.target.value }))}
                                        className="w-full px-2 py-1 border border-purple-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-400"
                                      />
                                    ) : (
                                      <span className="font-mono text-xs">{lot.lotNumber}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {isEditing ? (
                                      <input
                                        type="date"
                                        value={editingLotData.expirationDate}
                                        onChange={e => setEditingLotData(d => ({ ...d, expirationDate: e.target.value }))}
                                        className="w-full px-2 py-1 border border-purple-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                                      />
                                    ) : (
                                      <span className="text-xs">{lot.expirationDate ? new Date(lot.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : <span className="text-gray-400">—</span>}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right text-xs">{lot.initialQuantity}</td>
                                  <td className="px-3 py-2 text-right font-medium text-xs">{lot.currentQuantity}</td>
                                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span></td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-center gap-1">
                                      {isEditing ? (
                                        <>
                                          <button
                                            onClick={() => saveEdit(lot.id!)}
                                            disabled={updateLot.isPending || !editingLotData.lotNumber.trim()}
                                            className="p-1 rounded text-green-600 hover:bg-green-100 disabled:opacity-40 transition-colors"
                                            title="Guardar"
                                          >
                                            <Check size={14} />
                                          </button>
                                          <button onClick={cancelEdit} className="p-1 rounded text-gray-500 hover:bg-gray-100 transition-colors" title="Cancelar">
                                            <X size={14} />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => startEdit(lot)}
                                            className="p-1 rounded text-purple-600 hover:bg-purple-100 transition-colors"
                                            title="Editar lote"
                                          >
                                            <Pencil size={13} />
                                          </button>
                                          <button
                                            onClick={() => updateLot.mutate({ id: lot.id!, data: { isActive: !lot.isActive } })}
                                            className={`p-1 rounded transition-colors ${lot.isActive ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}
                                            title={lot.isActive ? 'Desactivar lote' : 'Activar lote'}
                                          >
                                            <PowerOff size={13} />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </Modal>

      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)} title={`Carga Masiva de Productos (${bulkProducts.length})`} size="xl">
        <div className="space-y-3">
          {bulkProducts.map((bp, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer" onClick={() => toggleExpand(idx)}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                  <span className="font-medium">{bp.name || 'Sin nombre'}</span>
                  {bp.categoryId && <span className="text-xs text-gray-500">{cats.find((c: any) => c.id === bp.categoryId)?.name}</span>}
                  {!bp.name && <span className="text-xs text-red-500">* Requerido</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={(e) => { e.stopPropagation(); duplicateBulkProduct(idx); }} className="p-1 text-gray-400 hover:text-blue-600" title="Duplicar"><Copy size={15} /></button>
                  {bulkProducts.length > 1 && <button type="button" onClick={(e) => { e.stopPropagation(); removeBulkProduct(idx); }} className="p-1 text-gray-400 hover:text-red-600" title="Eliminar"><X size={15} /></button>}
                  {bp.expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </div>
              {bp.expanded && (
                <div className="p-4 space-y-3 border-t">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label><input value={bp.name} onChange={(e) => updateBulkProduct(idx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Nombre del producto" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label><input value={bp.description} onChange={(e) => updateBulkProduct(idx, 'description', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Opcional" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Ingrediente Activo</label><input value={bp.activeIngredient} onChange={(e) => updateBulkProduct(idx, 'activeIngredient', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Glifosato 480 g/L" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label><input value={bp.location} onChange={(e) => updateBulkProduct(idx, 'location', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: P 4 (a)" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label><select value={bp.categoryId} onChange={(e) => updateBulkProduct(idx, 'categoryId', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Seleccionar...</option>{cats.filter((c: any) => c.isActive).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label><select value={bp.unit} onChange={(e) => updateBulkProduct(idx, 'unit', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">{allUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo IGV</label><select value={bp.taxType} onChange={(e) => updateBulkProduct(idx, 'taxType', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">{TAX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  </div>
                  {comps.length > 0 && (
                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Stock Inicial por Empresa</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{comps.filter((c: any) => c.isActive).map((c: any) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className="text-xs w-20 truncate">{c.name}</span>
                          <input type="number" step="0.01" min="0" placeholder="0" value={bp.initialStocks.find(s => s.companyId === c.id)?.quantity || ''} onChange={(e) => updateBulkStock(idx, c.id, parseFloat(e.target.value) || 0)} className="flex-1 px-2 py-1.5 border rounded-lg text-sm" />
                        </div>
                      ))}</div>
                    </div>
                  )}
                  {tiers.length > 0 && (
                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Precios por Rango</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{tiers.map((tier: any) => (
                        <div key={tier.id} className="flex items-center gap-2">
                          <span className="text-xs w-20 truncate">{tier.name}</span>
                          <input type="number" step="0.01" min="0" placeholder="0.00" value={bp.prices.find(p => p.priceTierId === tier.id)?.price || ''} onChange={(e) => updateBulkPrice(idx, tier.id, parseFloat(e.target.value) || 0)} className="flex-1 px-2 py-1.5 border rounded-lg text-sm" />
                        </div>
                      ))}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBulkProducts(prev => [...prev, emptyBulkProduct()])} className="flex-1 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-600 text-sm">+ Agregar otro producto</button>
            <button type="button" onClick={handleDownloadTemplate} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 text-sm"><Download size={14} /> Plantilla Excel</button>
          </div>
          <button type="button" onClick={handleBulkSubmit} disabled={bulkLoading} className="w-full py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
            {bulkLoading ? 'Creando productos...' : `Crear ${bulkProducts.filter(p => p.name && p.categoryId).length} producto(s)`}
          </button>
        </div>
      </Modal>

      {/* Modal de previsualización de importación Excel del cliente */}
      <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportPreview(null); }} title="Confirmar Importación de Productos" size="lg">
        {importPreview && (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{importPreview.toCreate.length}</div>
                <div className="text-sm text-green-600">Productos nuevos</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{importPreview.toUpdate.length}</div>
                <div className="text-sm text-blue-600">Productos a actualizar</div>
              </div>
            </div>

            {importPreview.newCategories.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-800 mb-1">Categorías nuevas a crear ({importPreview.newCategories.length}):</p>
                <div className="flex flex-wrap gap-1">{importPreview.newCategories.map(c => <span key={c} className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-0.5 rounded-full">{c}</span>)}</div>
              </div>
            )}
            {importPreview.newSubcategories.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm font-medium text-orange-800 mb-1">Subcategorías nuevas a crear ({importPreview.newSubcategories.length}):</p>
                <div className="flex flex-wrap gap-1">{importPreview.newSubcategories.map((s, i) => <span key={i} className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-2 py-0.5 rounded-full">{s.catName} → {s.name}</span>)}</div>
              </div>
            )}

            {/* Lista de productos */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Lista de productos ({importPreview.toCreate.length + importPreview.toUpdate.length}):</p>
              <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                {importPreview.toCreate.map(name => (
                  <div key={name} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-sm text-gray-700 truncate">{name}</span>
                    <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">NUEVO</span>
                  </div>
                ))}
                {importPreview.toUpdate.map(name => (
                  <div key={name} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-sm text-gray-700 truncate">{name}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">ACTUALIZAR</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setShowImportModal(false); setImportPreview(null); }} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancelar</button>
              <button onClick={handleImportConfirm} disabled={importLoading} className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium">
                {importLoading ? 'Importando...' : `Confirmar importación`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
