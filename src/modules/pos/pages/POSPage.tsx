import { useState, useMemo, useEffect, useRef } from 'react';
import { useProducts } from '../../products/hooks/useProducts';
import { useCategories } from '../../categories/hooks/useCategories';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useClients } from '../../clients/hooks/useClients';
import { usePriceTiers } from '../../price-tiers/hooks/usePriceTiers';
import { usePaymentMethods } from '../../payment-methods/hooks/usePaymentMethods';
import { useCreateSale } from '../../sales/hooks/useSales';
import { useCreateQuote, useQuote, useConvertQuote } from '../../quotes/hooks/useQuotes';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { stockService } from '../../stock/services/stockService';
import { Search, Plus, Minus, Trash2, Package, X, ShoppingCart, CreditCard, User, Pencil, Tag, ScrollText, Landmark, ChevronDown, LayoutGrid, List, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Product, ProductPrice, Category, Company, Client, PriceTier, PaymentMethod, CreditAccount, ProductLot } from '../../../shared/types';
import { productLotService } from '../../stock/services/productLotService';
import { useOpenClientCredits } from '../../credits/hooks/useCredits';

const IGV_RATE = 0.18;

function getPaymentMethodColors(name: string, selected: boolean): string {
  const n = name.toLowerCase();
  if (n.includes('yape'))
    return selected
      ? 'bg-purple-800 text-white border-purple-800'
      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-600';
  if (n.includes('plin'))
    return selected
      ? 'bg-cyan-700 text-white border-cyan-700'
      : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-500';
  if (n.includes('transferencia'))
    return selected
      ? 'bg-indigo-600 text-white border-indigo-600'
      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400';
  return selected
    ? 'bg-primary-600 text-white border-primary-600'
    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300';
}

interface CartItem {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string;
  tierOverride?: string;    // if set, uses this tier instead of global
  isCustomPrice?: boolean;  // true = manually edited, don't re-resolve
  lotId?: string;
  lotNumber?: string;
  expirationDate?: string;
  lotCurrentQty?: number;   // stock cap for this specific lot
}

function resolvePrice(product: Product, tierId: string, companyId: string): number | undefined {
  if (!product.prices?.length) return undefined;
  const byCompany = product.prices.find((p: ProductPrice) => p.priceTierId === tierId && p.companyId === companyId);
  if (byCompany) return byCompany.price;
  const global = product.prices.find((p: ProductPrice) => p.priceTierId === tierId && !p.companyId);
  return global?.price;
}

const BROWSE_LIMIT = 24;

export function POSPage() {
  // Estados de búsqueda/paginación (antes del query para usarlos como params)
  const [categoryId, setCategoryId] = useState<string>('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [ingredientFilter, setIngredientFilter] = useState('');
  const [controlFilter, setControlFilter] = useState('');
  const [browsePage, setBrowsePage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedIngredient, setDebouncedIngredient] = useState('');
  const [debouncedControl, setDebouncedControl] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedIngredient(ingredientFilter.trim()), 350);
    return () => clearTimeout(t);
  }, [ingredientFilter]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedControl(controlFilter.trim()), 350);
    return () => clearTimeout(t);
  }, [controlFilter]);
  useEffect(() => { setBrowsePage(1); }, [debouncedSearch, debouncedIngredient, debouncedControl, categoryId, selectedParentId]);

  const isSearching = !!(debouncedSearch || debouncedIngredient || debouncedControl);
  // When a parent category is expanded and "Todas" is selected (categoryId=''), fetch all products
  // and filter client-side to include parent + all its subcategories.
  const isBrowsingAllSubs = !!(selectedParentId && !categoryId);
  const isWideSearch = isSearching || isBrowsingAllSubs;

  const { data: productsData, isFetching: productsFetching } = useProducts(
    isWideSearch
      ? { search: debouncedSearch || undefined, activeIngredient: debouncedIngredient || undefined, control: debouncedControl || undefined, category: categoryId || undefined, limit: 500 }
      : { page: browsePage, limit: BROWSE_LIMIT, category: categoryId || (selectedParentId || undefined) },
    { placeholderData: (prev: any) => prev },
  );
  const { data: categoriesData } = useCategories();
  const { data: companiesData } = useCompanies();
  const { data: clientsData } = useClients({ limit: 500 });
  const { data: priceTiers } = usePriceTiers();
  const { data: paymentMethodsData } = usePaymentMethods();
  const createSale = useCreateSale();

  const products: Product[] = useMemo(() => {
    const raw: any = productsData;
    const list: Product[] = Array.isArray(raw) ? raw : raw?.data || [];
    return list.filter((p) => p.isActive);
  }, [productsData]);

  const totalProducts: number = useMemo(() => {
    const raw: any = productsData;
    return Array.isArray(raw) ? raw.length : (raw?.total ?? 0);
  }, [productsData]);

  const totalPages = isWideSearch ? 1 : Math.ceil(totalProducts / BROWSE_LIMIT);

  const categories: Category[] = useMemo(() => {
    const list: Category[] = Array.isArray(categoriesData) ? categoriesData : [];
    return list.filter((c) => c.isActive);
  }, [categoriesData]);

  const topLevel = useMemo(() => categories.filter(c => !c.parentId), [categories]);
  const subsByParent = useMemo(() => {
    const map: Record<string, Category[]> = {};
    categories.forEach(c => {
      if (c.parentId) {
        if (!map[c.parentId]) map[c.parentId] = [];
        map[c.parentId].push(c);
      }
    });
    return map;
  }, [categories]);

  const companies: Company[] = useMemo(() => {
    const list: Company[] = Array.isArray(companiesData) ? companiesData : [];
    return list.filter((c) => c.isActive);
  }, [companiesData]);

  const clients: Client[] = useMemo(() => {
    const raw: any = clientsData;
    const list: Client[] = Array.isArray(raw) ? raw : raw?.data || [];
    return list.filter((c) => c.isActive);
  }, [clientsData]);

  const tiers: PriceTier[] = useMemo(() => {
    const list: PriceTier[] = Array.isArray(priceTiers) ? priceTiers : [];
    return list.filter((t) => t.isActive).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }, [priceTiers]);

  const paymentMethods: PaymentMethod[] = useMemo(() => {
    const raw: any = paymentMethodsData;
    const list: PaymentMethod[] = Array.isArray(raw) ? raw : raw?.data || [];
    return list.filter((p) => p.isActive);
  }, [paymentMethodsData]);

  const [companyId, setCompanyId] = useState<string>('');
  const [tierId, setTierId] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [infoProductId, setInfoProductId] = useState<string | null>(null);
  const [quoteClientId, setQuoteClientId] = useState('');
  const [quoteClientName, setQuoteClientName] = useState('');
  const [quoteValidUntil, setQuoteValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [quoteNotes, setQuoteNotes] = useState('');
  const createQuote = useCreateQuote();
  const convertQuote = useConvertQuote();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromQuoteId = searchParams.get('fromQuote') || '';
  const { data: preloadedQuote } = useQuote(fromQuoteId);
  const { data: allProductsData } = useProducts({ limit: 9999 }, { enabled: !!fromQuoteId } as any);
  const allProducts: Product[] = useMemo(() => {
    if (!fromQuoteId) return products;
    const raw: any = allProductsData;
    const list: Product[] = Array.isArray(raw) ? raw : raw?.data || [];
    return list.filter((p) => p.isActive);
  }, [fromQuoteId, allProductsData, products]);
  const [sourceQuoteId, setSourceQuoteId] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [voucherType, setVoucherType] = useState<'NONE' | 'BOLETA' | 'FACTURA'>('NONE');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [splitPayments, setSplitPayments] = useState<{ paymentMethodId: string; amount: number }[]>([]);
  const [isCredit, setIsCredit] = useState(false);
  const [creditAccountId, setCreditAccountId] = useState<string>('new');
  const [creditName, setCreditName] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const catRowRef = useRef<HTMLDivElement>(null);
  const subRowRef = useRef<HTMLDivElement>(null);

  const { data: openCredits } = useOpenClientCredits(isCredit ? clientId : '');

  const { data: stockList } = useQuery({
    queryKey: ['stock', companyId],
    queryFn: () => stockService.getByCompany(companyId, { limit: 9999 }),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const [lotSelectorProduct, setLotSelectorProduct] = useState<Product | null>(null);
  const [pendingLotId, setPendingLotId] = useState<string>('');

  const { data: productLotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ['product-lots', companyId, lotSelectorProduct?.id],
    queryFn: () => productLotService.getByCompany(companyId, lotSelectorProduct!.id),
    enabled: !!lotSelectorProduct && !!companyId,
  });
  const productLots: ProductLot[] = useMemo(() => {
    return Array.isArray(productLotsData) ? productLotsData : [];
  }, [productLotsData]);

  const pendingLot = productLots.find(l => l.id === pendingLotId) ?? null;
  const pendingLotExpired = pendingLot?.expirationDate
    ? new Date(pendingLot.expirationDate) < new Date()
    : false;

  const stockByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    const list: any[] = Array.isArray(stockList) ? stockList : (stockList as any)?.data || [];
    list.forEach((s) => {
      const pid = s.productId || s.product?.id || s.product?._id || s.product;
      if (pid) map[String(pid)] = s.quantity;
    });
    return map;
  }, [stockList]);

  // Preload cart from quote (if ?fromQuote=... param)
  useEffect(() => {
    if (!preloadedQuote || !allProducts.length || sourceQuoteId === preloadedQuote.id) return;
    if (preloadedQuote.status === 'CONVERTED' || preloadedQuote.status === 'REJECTED') {
      toast.error('Esta cotización ya no puede convertirse');
      navigate('/quotes');
      return;
    }
    if (preloadedQuote.companyId) setCompanyId(preloadedQuote.companyId);
    if (preloadedQuote.clientId) setClientId(preloadedQuote.clientId);
    const items: CartItem[] = preloadedQuote.items.map((i: any) => {
      const p = allProducts.find(pr => pr.id === i.productId);
      return {
        productId: i.productId,
        name: p?.name || '—',
        unit: p?.unit || '',
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        tierOverride: i.priceTier,
        isCustomPrice: true,
      };
    });
    setCart(items);
    setSourceQuoteId(preloadedQuote.id);
    toast.success(`Cotización ${preloadedQuote.quoteNumber} cargada`);
  }, [preloadedQuote, allProducts, sourceQuoteId, navigate]);

  // Defaults once data loads
  useEffect(() => {
    if (!companyId && companies.length) setCompanyId(companies[0].id);
  }, [companies, companyId]);
  useEffect(() => {
    if (!tierId && tiers.length) setTierId(tiers[0].id);
  }, [tiers, tierId]);
  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length) setPaymentMethodId(paymentMethods[0].id);
  }, [paymentMethods, paymentMethodId]);

  // Keyboard shortcut: Ctrl+K focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll horizontal con rueda del ratón — fila de categorías padre
  useEffect(() => {
    const el = catRowRef.current;
    if (!el) return;
    const fn = (e: WheelEvent) => { if (!e.deltaY) return; e.preventDefault(); el.scrollLeft += e.deltaY; };
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, []);

  // Scroll horizontal con rueda — fila de subcategorías (se re-ejecuta cuando aparece/desaparece)
  useEffect(() => {
    const el = subRowRef.current;
    if (!el) return;
    const fn = (e: WheelEvent) => { if (!e.deltaY) return; e.preventDefault(); el.scrollLeft += e.deltaY; };
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, [selectedParentId]);

  // Re-resolve prices when global tier or company changes (only non-custom, non-override items)
  useEffect(() => {
    if (!tierId || !companyId || cart.length === 0) return;
    setCart((prev) =>
      prev.map((item) => {
        if (item.isCustomPrice) return item;
        const effectiveTier = item.tierOverride || tierId;
        const product = products.find((p) => p.id === item.productId);
        if (!product) return item;
        const price = resolvePrice(product, effectiveTier, companyId);
        if (price == null || price === item.unitPrice) return item;
        return { ...item, unitPrice: price };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierId, companyId]);

  const filteredProducts = useMemo(() => {
    if (isBrowsingAllSubs) {
      const validIds = new Set([selectedParentId, ...(subsByParent[selectedParentId] || []).map((s) => s.id)]);
      return products.filter((p) => p.categoryId && validIds.has(p.categoryId));
    }
    return products;
  }, [products, isBrowsingAllSubs, selectedParentId, subsByParent]);

  const cartQty = (productId: string) => cart.find((i) => i.productId === productId)?.quantity || 0;

  const addToCart = (product: Product) => {
    if (!companyId) { toast.error('Selecciona una empresa'); return; }
    if (!tierId) { toast.error('Selecciona un rango de precio'); return; }
    const price = resolvePrice(product, tierId, companyId);
    if (price == null) { toast.error(`Sin precio configurado para ${product.name}`); return; }

    if (product.tracksLot) {
      const existingLotItem = cart.find(i => i.productId === product.id && i.lotId);
      if (existingLotItem) {
        // Lote ya seleccionado — sólo incrementar
        setCart(prev => prev.map(i =>
          i.productId === product.id && i.lotId === existingLotItem.lotId
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        ));
        return;
      }
      setLotSelectorProduct(product);
      setPendingLotId('');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          unitPrice: price,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const confirmLotAdd = (lot: ProductLot) => {
    if (!lotSelectorProduct) return;
    const price = resolvePrice(lotSelectorProduct, tierId, companyId)!;
    setCart(prev => {
      const existing = prev.find(i => i.productId === lotSelectorProduct.id);
      if (existing) {
        return prev.map(i => i.productId === lotSelectorProduct.id
          ? { ...i, quantity: i.quantity + 1, lotId: lot.id, lotNumber: lot.lotNumber, expirationDate: lot.expirationDate, lotCurrentQty: lot.currentQuantity }
          : i,
        );
      }
      return [...prev, {
        productId: lotSelectorProduct.id,
        name: lotSelectorProduct.name,
        unit: lotSelectorProduct.unit,
        quantity: 1,
        unitPrice: price,
        imageUrl: lotSelectorProduct.imageUrl,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        expirationDate: lot.expirationDate,
        lotCurrentQty: lot.currentQuantity,
      }];
    });
    setLotSelectorProduct(null);
    setPendingLotId('');
  };

  const updateQty = (productId: string, delta: number) => {
    if (delta > 0) {
      const item = cart.find(i => i.productId === productId);
      const maxQty = item?.lotId ? (item.lotCurrentQty ?? stockByProduct[productId] ?? 0) : (stockByProduct[productId] ?? 0);
      const current = item?.quantity || 0;
      if (current + delta > maxQty) {
        toast.error(item?.lotId ? `Solo hay ${maxQty} disponible en este lote` : `Solo hay ${maxQty} en stock`);
        return;
      }
    }
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const setQty = (productId: string, value: number) => {
    if (isNaN(value) || value <= 0) { removeFromCart(productId); return; }
    const item = cart.find(i => i.productId === productId);
    const maxQty = item?.lotId ? (item.lotCurrentQty ?? stockByProduct[productId] ?? 0) : (stockByProduct[productId] ?? 0);
    if (value > maxQty) {
      toast.error(item?.lotId ? `Solo hay ${maxQty} disponible en este lote` : `Solo hay ${maxQty} en stock`);
      value = maxQty;
    }
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: value } : i));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  const clearCart = () => setCart([]);

  const setItemTier = (productId: string, newTierId: string) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        const product = products.find((p) => p.id === i.productId);
        if (!product) return i;
        const useTier = newTierId || tierId;
        const price = resolvePrice(product, useTier, companyId);
        if (price == null) {
          toast.error('Sin precio configurado para ese rango');
          return i;
        }
        return {
          ...i,
          unitPrice: price,
          tierOverride: newTierId && newTierId !== tierId ? newTierId : undefined,
          isCustomPrice: false,
        };
      }),
    );
  };

  const setItemCustomPrice = (productId: string, price: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, unitPrice: price, isCustomPrice: true, tierOverride: undefined }
          : i,
      ),
    );
  };

  const [editingPriceFor, setEditingPriceFor] = useState<string | null>(null);

  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const igv = subtotal * IGV_RATE;
  const total = subtotal;

  const openCheckout = () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }
    if (!paymentMethodId) {
      toast.error('No hay métodos de pago configurados');
      return;
    }
    setIsCredit(false);
    setCreditAccountId('new');
    setCreditName('');
    setSplitPayments([{ paymentMethodId, amount: 0 }]);
    setShowCheckout(true);
  };

  const splitTotal = splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const splitRemaining = Math.round((total - splitTotal) * 100) / 100;

  const confirmSale = async () => {
    if (isCredit) {
      if (!clientId) { toast.error('Selecciona un cliente para la venta a crédito'); return; }
      if (creditAccountId === 'new' && !creditName.trim()) { toast.error('Ingresa un nombre para la cuenta de crédito'); return; }
    } else {
      const validPayments = splitPayments.filter(p => p.paymentMethodId && p.amount > 0);
      if (validPayments.length === 0) { toast.error('Ingresa al menos un método de pago con monto'); return; }
      if (Math.abs(splitTotal - total) > 0.01) {
        toast.error(`La suma de pagos (${splitTotal.toFixed(2)}) no coincide con el total (${total.toFixed(2)})`);
        return;
      }
    }
    const validPayments = isCredit ? [] : splitPayments.filter(p => p.paymentMethodId && p.amount > 0);
    try {
      if (sourceQuoteId) {
        await convertQuote.mutateAsync({
          id: sourceQuoteId,
          payload: {
            companyId,
            clientId: clientId || undefined,
            voucherType,
            isCredit,
            payments: validPayments,
          },
        });
      } else {
        await createSale.mutateAsync({
          clientId: clientId || undefined,
          voucherType,
          isCredit,
          creditAccountId: isCredit && creditAccountId !== 'new' ? creditAccountId : undefined,
          creditName: isCredit && creditAccountId === 'new' ? creditName.trim() : undefined,
          items: cart.map((i) => ({
            productId: i.productId,
            companyId,
            quantity: i.quantity,
            priceTier: i.tierOverride || tierId,
            unitPrice: i.unitPrice,
            ...(i.lotId ? { lotId: i.lotId } : {}),
          })),
          payments: validPayments,
        } as any);
      }
      setCart([]);
      setClientId('');
      setVoucherType('NONE');
      setSplitPayments([]);
      setIsCredit(false);
      setCreditAccountId('new');
      setCreditName('');
      setShowCheckout(false);
      if (sourceQuoteId) {
        setSourceQuoteId('');
        setSearchParams({});
      }
    } catch {
      // errors handled by mutation onError
    }
  };

  return (
    <div className="-mx-4 -mt-4 -mb-24 lg:-m-8 h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] flex bg-surface">
      {/* Products panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-2 lg:py-3 flex flex-col gap-2">
          {/* Fila 1: nombre + empresa/contador/toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre del producto…"
                className="w-full pl-9 pr-8 py-2 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors"
              />
              {search && (
                <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Contador + toggle + empresa */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {productsFetching && isSearching && (
                <span className="hidden sm:flex text-xs text-gray-400 whitespace-nowrap items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-primary-500 animate-spin inline-block" />
                </span>
              )}
              {!productsFetching && isSearching && (
                <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap bg-gray-100 px-2 py-1 rounded-lg font-medium">
                  {filteredProducts.length}
                </span>
              )}
              <div className="flex items-center bg-gray-100 rounded-xl p-0.5 flex-shrink-0">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400 hover:text-gray-600'}`} title="Vista tarjetas"><LayoutGrid size={15} /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400 hover:text-gray-600'}`} title="Vista lista"><List size={15} /></button>
              </div>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                className="text-sm bg-white border border-gray-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-[90px] sm:max-w-none">
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>

          {/* Fila 2: ingrediente activo + control */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={ingredientFilter} onChange={(e) => setIngredientFilter(e.target.value)}
                placeholder="Ingrediente activo…"
                className="w-full pl-8 pr-7 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors" />
              {ingredientFilter && (
                <button onClick={() => setIngredientFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={controlFilter} onChange={(e) => setControlFilter(e.target.value)}
                placeholder="Control…"
                className="w-full pl-8 pr-7 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors" />
              {controlFilter && (
                <button onClick={() => setControlFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
              )}
            </div>
          </div>
        </div>

        {/* Category tabs — fila 1: categorías padre */}
        <div ref={catRowRef} className="bg-white border-b border-gray-200 px-4 lg:px-6 py-2 flex gap-2 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => { setSelectedParentId(''); setCategoryId(''); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              !categoryId && !selectedParentId ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Todos
          </button>
          {topLevel.map((c) => {
            const hasSubs = !!(subsByParent[c.id]?.length);
            const isActive = selectedParentId === c.id
              || categoryId === c.id
              || !!(subsByParent[c.id]?.some(s => s.id === categoryId));
            return (
              <button
                key={c.id}
                onClick={() => {
                  if (hasSubs) {
                    setSelectedParentId(prev => prev === c.id ? '' : c.id);
                    setCategoryId('');
                  } else {
                    setSelectedParentId('');
                    setCategoryId(prev => prev === c.id ? '' : c.id);
                  }
                }}
                className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c.name}
                {hasSubs && (
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${selectedParentId === c.id ? 'rotate-180' : ''}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Category tabs — fila 2: subcategorías (aparece al seleccionar un padre con hijos) */}
        {selectedParentId && (subsByParent[selectedParentId]?.length ?? 0) > 0 && (
          <div ref={subRowRef} className="bg-gray-50 border-b border-gray-200 px-4 lg:px-6 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0">
              {topLevel.find(c => c.id === selectedParentId)?.name}
            </span>
            <span className="text-gray-300 flex-shrink-0 select-none">›</span>
            <button
              onClick={() => setCategoryId('')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                !categoryId ? 'bg-primary-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              Todas
            </button>
            {subsByParent[selectedParentId].map(sub => (
              <button
                key={sub.id}
                onClick={() => setCategoryId(prev => prev === sub.id ? '' : sub.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  categoryId === sub.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}

        {/* Products grid */}
        <div className="flex-1 overflow-auto p-3 pb-20 lg:p-6 relative">
          {productsFetching && filteredProducts.length > 0 && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 pointer-events-none">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-500" />
            </div>
          )}
          {productsFetching && filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Package size={48} className="mb-3" />
              <div className="text-sm">
                {isSearching ? 'Sin resultados para tu búsqueda' : 'Sin productos en esta categoría'}
              </div>
            </div>
          ) : (
            <>
            {/* ── LIST VIEW ── */}
            {viewMode === 'list' && (
              <div className="space-y-1.5">
                {filteredProducts.map((p) => {
                  const price = tierId && companyId ? resolvePrice(p, tierId, companyId) : undefined;
                  const qty = cartQty(p.id);
                  const stock = stockByProduct[p.id] ?? 0;
                  const available = stock - qty;
                  const isOutOfStock = stock === 0;
                  const ings = p.activeIngredients?.length
                    ? p.activeIngredients
                    : p.activeIngredient ? [{ name: p.activeIngredient, concentration: '' }] : [];
                  const hasInfo = ings.length > 0 || !!p.control || !!p.dosis || !!p.location;
                  const showingInfo = infoProductId === p.id;
                  return (
                    <div key={p.id} className={`bg-white rounded-xl shadow-card overflow-hidden ${isOutOfStock ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        {/* Thumbnail con badge de cantidad en carrito */}
                        <div className="relative w-10 h-10 flex-shrink-0">
                          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center overflow-hidden">
                            {p.imageUrl
                              ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                              : <Package size={18} className="text-primary-400" />
                            }
                          </div>
                          {qty > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 min-w-[18px] min-h-[18px] flex items-center justify-center leading-none px-0.5">
                              {qty}
                            </span>
                          )}
                        </div>
                        {/* Nombre + stock + precio */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate leading-snug">{p.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isOutOfStock ? 'bg-red-50 text-red-600' : stock <= 10 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                              {isOutOfStock ? 'Agotado' : `Stock: ${stock}`}
                            </span>
                            {price != null && (
                              <span className="text-sm font-bold text-gray-900">S/ {price.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        {/* Info + Add/remove */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasInfo && (
                            <button
                              onClick={() => setInfoProductId(showingInfo ? null : p.id)}
                              className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${showingInfo ? 'bg-yellow-500 text-white' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'}`}
                              title="Ver datos del producto"
                            >
                              ?
                            </button>
                          )}
                          {qty > 0 && (
                            <button
                              onClick={() => updateQty(p.id, -1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              <Minus size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (available <= 0) { toast.error(`Sin stock disponible para ${p.name}`); return; }
                              addToCart(p);
                            }}
                            disabled={isOutOfStock}
                            className="w-7 h-7 rounded-lg bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 transition-colors"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Info expandible */}
                      {showingInfo && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-yellow-50 space-y-1.5 text-xs text-gray-700">
                          {ings.length > 0 && (
                            <div><span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Ingredientes activos: </span>
                              {ings.map((ing, i) => <span key={i}>{ing.name}{ing.concentration ? ` (${ing.concentration})` : ''}{i < ings.length - 1 ? ', ' : ''}</span>)}
                            </div>
                          )}
                          {p.control && <div><span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Control: </span>{p.control}</div>}
                          {p.dosis && <div><span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Dosis: </span>{p.dosis}</div>}
                          {p.location && <div><span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Ubicación: </span>{p.location}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── GRID VIEW ── */}
            {viewMode === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => {
                const price = tierId && companyId ? resolvePrice(p, tierId, companyId) : undefined;
                const qty = cartQty(p.id);
                const stock = stockByProduct[p.id] ?? 0;
                const available = stock - qty;
                const stockColor =
                  stock === 0
                    ? 'bg-red-50 text-red-600'
                    : stock <= 10
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-gray-50 text-gray-600';
                const ings = p.activeIngredients?.length
                  ? p.activeIngredients
                  : p.activeIngredient
                  ? [{ name: p.activeIngredient, concentration: '' }]
                  : [];
                  const isOutOfStock = stock === 0;
                const showingInfo = infoProductId === p.id;
                const hasInfo = ings.length > 0 || !!p.control || !!p.dosis || !!p.location;

                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (showingInfo) { setInfoProductId(null); return; }
                      if (available <= 0) {
                        toast.error(`Sin stock disponible para ${p.name}`);
                        return;
                      }
                      addToCart(p);
                    }}
                    className={`relative bg-white rounded-xl shadow-card p-4 text-left hover:shadow-card-hover hover:-translate-y-0.5 transition-all group ${isOutOfStock ? 'opacity-70' : ''}`}
                  >
                    {qty > 0 && !showingInfo && (
                      <span className="absolute top-2 left-2 z-10 bg-primary-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                        {qty}
                      </span>
                    )}
                    <span className={`absolute top-2 right-2 z-10 text-xs font-semibold px-2 py-1 rounded-md shadow-sm ${stockColor}`}>
                      {isOutOfStock ? 'Agotado' : `Stock: ${stock}`}
                    </span>

                    {/* Info overlay */}
                    {showingInfo && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute inset-0 z-20 bg-white rounded-xl p-3 flex flex-col shadow-card"
                      >
                        <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0">
                          {ings.length > 0 && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ingredientes activos</div>
                              <div className="space-y-1">
                                {ings.map((ing, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-semibold text-gray-800">{ing.name}</span>
                                    {ing.concentration && (
                                      <span className="ml-1 text-gray-500 font-mono">{ing.concentration}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {p.control && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Control</div>
                              <span className="text-xs text-gray-800">{p.control}</span>
                            </div>
                          )}
                          {p.dosis && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Dosis</div>
                              <span className="text-xs text-gray-800">{p.dosis}</span>
                            </div>
                          )}
                          {p.location && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ubicación</div>
                              <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">{p.location}</span>
                            </div>
                          )}
                          {!hasInfo && (
                            <p className="text-xs text-gray-400 italic">Sin información adicional.</p>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setInfoProductId(null); }}
                          className="mt-2 w-full py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 text-xs font-bold rounded-lg transition-colors"
                        >
                          Cerrar
                        </button>
                      </div>
                    )}

                    <div className="relative w-full aspect-square rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors overflow-hidden">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                        : <Package size={32} />
                      }
                      {/* Info button — shown when there are ingredients or location */}
                      {hasInfo && (
                        <button
                          onClick={e => { e.stopPropagation(); setInfoProductId(showingInfo ? null : p.id); }}
                          className={`absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors shadow-sm ${showingInfo ? 'bg-yellow-500 text-white' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'}`}
                          title="Ver ingredientes activos"
                        >
                          ?
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-800 leading-tight line-clamp-2 min-h-[2.5rem]">
                      {p.name}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-base font-bold text-gray-900">
                        {price != null ? `S/ ${price.toFixed(2)}` : '—'}
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-primary-600 text-white flex items-center justify-center shadow-sm group-hover:bg-primary-700">
                        <Plus size={14} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            )}
            {!isSearching && totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-6 pb-2">
                <button
                  onClick={() => setBrowsePage(p => Math.max(1, p - 1))}
                  disabled={browsePage === 1 || productsFetching}
                  className="px-4 py-1.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                <span className="text-sm text-gray-500 font-medium tabular-nums whitespace-nowrap">
                  {browsePage} / {totalPages}
                  <span className="text-gray-400 font-normal ml-1.5">({totalProducts} productos)</span>
                </span>
                <button
                  onClick={() => setBrowsePage(p => Math.min(totalPages, p + 1))}
                  disabled={browsePage === totalPages || productsFetching}
                  className="px-4 py-1.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Cart panel — fixed drawer on mobile, static panel on desktop */}
      <aside className={`fixed top-0 bottom-16 right-0 z-40 w-[85vw] max-w-sm bg-white border-l border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out lg:static lg:top-auto lg:bottom-auto lg:w-96 xl:w-[440px] 2xl:w-[500px] lg:max-w-none lg:z-auto lg:translate-x-0 ${cartOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={20} className="text-primary-600" />
              <div>
                <div className="text-base font-semibold text-gray-800">Carrito</div>
                <div className="text-sm text-gray-500">
                  {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={() => setCartOpen(false)}
                className="lg:hidden text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-gray-400" />
            <span className="text-sm text-gray-500 shrink-0">Rango:</span>
            <select
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
              <ShoppingCart size={40} className="mb-2 opacity-50" />
              <div className="text-sm">Agrega productos al carrito</div>
            </div>
          ) : (
            cart.map((item) => {
              const effectiveTierId = item.tierOverride || tierId;
              const effectiveTierName = item.isCustomPrice
                ? 'Personalizado'
                : tiers.find((t) => t.id === effectiveTierId)?.name || '';
              const isOverridden = !!item.tierOverride || !!item.isCustomPrice;
              const isEditing = editingPriceFor === item.productId;
              const lotExpired = item.expirationDate ? new Date(item.expirationDate) < new Date() : false;
              return (
                <div key={item.productId} className={`rounded-xl p-3 ${lotExpired ? 'bg-red-50' : 'bg-gray-50'}`}>
                  {/* Fila 1: ícono + nombre + papelera */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white text-primary-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        : <Package size={15} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate leading-snug">{item.name}</div>
                      {item.lotNumber && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${lotExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            Lote: {item.lotNumber}
                          </span>
                          {item.expirationDate && (
                            <span className={`text-[10px] font-medium ${lotExpired ? 'text-red-500' : 'text-gray-400'}`}>
                              {lotExpired
                                ? `VENCIDO ${new Date(item.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}`
                                : `Vence ${new Date(item.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}`
                              }
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Fila 2: precio · unidad · tier | controles cantidad */}
                  <div className="flex items-center justify-between gap-2 mt-2 pl-10">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-sm font-medium text-gray-700">
                        S/ {item.unitPrice.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400">· {item.unit}</span>
                      <button
                        onClick={() => setEditingPriceFor(isEditing ? null : item.productId)}
                        className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium transition-colors flex items-center gap-0.5 ${
                          isOverridden
                            ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                            : 'text-gray-400 hover:text-primary-600 hover:bg-gray-100'
                        }`}
                        title="Cambiar precio / rango"
                      >
                        <Pencil size={9} /> {effectiveTierName}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => updateQty(item.productId, -1)}
                        className="w-7 h-7 rounded-md bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setQty(item.productId, parseFloat(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        className="text-sm font-semibold w-10 text-center border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => updateQty(item.productId, 1)}
                        className="w-7 h-7 rounded-md bg-primary-600 text-white hover:bg-primary-700 flex items-center justify-center"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      <div className="text-[11px] text-gray-500 font-medium">Cambiar rango de precio</div>
                      <div className="flex flex-wrap gap-1">
                        {tiers.map((t) => {
                          const isActive = !item.isCustomPrice && effectiveTierId === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => {
                                setItemTier(item.productId, t.id);
                                setEditingPriceFor(null);
                              }}
                              className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                                isActive
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-400'
                              }`}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[11px] text-gray-500 font-medium pt-1">Precio personalizado</div>
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">S/</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.unitPrice.toFixed(2)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const v = parseFloat((e.target as HTMLInputElement).value);
                                if (!isNaN(v) && v >= 0) {
                                  setItemCustomPrice(item.productId, v);
                                  setEditingPriceFor(null);
                                }
                              }
                            }}
                            className="w-full pl-7 pr-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <button
                          onClick={(e) => {
                            const input = (e.currentTarget.previousElementSibling as HTMLElement)
                              ?.querySelector('input') as HTMLInputElement;
                            const v = parseFloat(input?.value || '0');
                            if (!isNaN(v) && v >= 0) {
                              setItemCustomPrice(item.productId, v);
                              setEditingPriceFor(null);
                            }
                          }}
                          className="px-3 py-1 bg-primary-600 text-white text-xs font-medium rounded-md hover:bg-primary-700"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-2">
            <div className="flex justify-between text-base text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium">S/ {(subtotal / (1 + IGV_RATE)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base text-gray-600">
              <span>IGV (18%)</span>
              <span className="font-medium">S/ {(subtotal - subtotal / (1 + IGV_RATE)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-gray-100">
              <span className="text-base font-semibold text-gray-700">Total</span>
              <span className="text-2xl font-bold text-primary-600">S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (cart.length === 0) { toast.error('El carrito está vacío'); return; }
                  setShowQuoteModal(true);
                }}
                className="flex-1 mt-2 py-3 bg-white border border-primary-600 text-primary-700 rounded-xl hover:bg-primary-50 font-semibold transition-colors flex items-center justify-center gap-2"
                title="Guardar como cotización"
              >
                <ScrollText size={18} />
                Cotización
              </button>
              <button
                onClick={openCheckout}
                className="flex-1 mt-2 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <CreditCard size={18} />
                Cobrar
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Checkout modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowQuoteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-hover w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><ScrollText size={18} /> Nueva Cotización</h2>
              <button onClick={() => setShowQuoteModal(false)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cliente</label>
                <select
                  value={quoteClientId}
                  onChange={(e) => {
                    setQuoteClientId(e.target.value);
                    const c = clients.find(cl => cl.id === e.target.value);
                    setQuoteClientName(c?.name || '');
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— Cliente ocasional —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {!quoteClientId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre del cliente <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input value={quoteClientName} onChange={(e) => setQuoteClientName(e.target.value)} placeholder="Cliente ocasional" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Válida hasta</label>
                <input type="date" value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Observaciones <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="bg-primary-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Total cotización</span>
                <span className="text-2xl font-bold text-primary-700">S/ {total.toFixed(2)}</span>
              </div>
              <button
                onClick={async () => {
                  try {
                    await createQuote.mutateAsync({
                      companyId,
                      clientId: quoteClientId || undefined,
                      clientName: quoteClientName || undefined,
                      validUntil: quoteValidUntil,
                      notes: quoteNotes || undefined,
                      items: cart.map(i => ({
                        productId: i.productId,
                        companyId,
                        quantity: i.quantity,
                        priceTier: i.tierOverride || tierId,
                        unitPrice: i.unitPrice,
                      })),
                    });
                    setShowQuoteModal(false);
                    setCart([]);
                    setQuoteClientId('');
                    setQuoteClientName('');
                    setQuoteNotes('');
                  } catch { /* toast handled by hook */ }
                }}
                disabled={createQuote.isPending}
                className="w-full py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 font-semibold transition-colors shadow-sm"
              >
                {createQuote.isPending ? 'Guardando…' : 'Guardar cotización'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lot selector modal */}
      {lotSelectorProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setLotSelectorProduct(null); setPendingLotId(''); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Seleccionar lote</h2>
                <p className="text-sm text-gray-500 truncate">{lotSelectorProduct.name}</p>
              </div>
              <button onClick={() => { setLotSelectorProduct(null); setPendingLotId(''); }} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {lotsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
                </div>
              ) : productLots.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Package size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay lotes con stock disponible</p>
                </div>
              ) : (
                productLots.map(lot => {
                  const expired = lot.expirationDate ? new Date(lot.expirationDate) < new Date() : false;
                  const expiringSoon = !expired && lot.expirationDate
                    ? (new Date(lot.expirationDate).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000
                    : false;
                  const isSelected = pendingLotId === lot.id;
                  return (
                    <button
                      key={lot.id}
                      onClick={() => setPendingLotId(isSelected ? '' : lot.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-colors text-left ${
                        isSelected
                          ? expired ? 'border-red-400 bg-red-50' : 'border-primary-500 bg-primary-50'
                          : expired
                            ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                            : expiringSoon
                              ? 'border-yellow-200 bg-yellow-50/40 hover:border-yellow-300'
                              : 'border-gray-200 bg-white hover:border-primary-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-800 text-sm">{lot.lotNumber}</div>
                        {lot.expirationDate ? (
                          <div className={`text-xs mt-0.5 font-medium ${expired ? 'text-red-600' : expiringSoon ? 'text-yellow-700' : 'text-gray-500'}`}>
                            {expired ? 'VENCIDO — ' : expiringSoon ? 'Por vencer — ' : 'Vence '}
                            {new Date(lot.expirationDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 mt-0.5">Sin fecha de vencimiento</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className={`text-base font-bold ${expired ? 'text-red-600' : 'text-gray-800'}`}>{lot.currentQuantity}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">disponible</div>
                      </div>
                    </button>
                  );
                })
              )}

              {pendingLot && pendingLotExpired && (
                <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Lote vencido</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Este lote venció el{' '}
                      {new Date(pendingLot.expirationDate!).toLocaleDateString('es-PE', { timeZone: 'UTC' })}.
                      Solo continúa si el cliente acepta producto vencido.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-gray-100 flex gap-2 shrink-0">
              <button
                onClick={() => { setLotSelectorProduct(null); setPendingLotId(''); }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              {pendingLot && (
                <button
                  onClick={() => confirmLotAdd(pendingLot)}
                  className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm ${
                    pendingLotExpired ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-600 hover:bg-primary-700'
                  }`}
                >
                  {pendingLotExpired ? 'Agregar (vencido)' : 'Agregar al carrito'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCheckout(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]">

            {/* Header */}
            <div className="bg-primary-600 rounded-t-2xl px-6 py-6 text-white shrink-0">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-white/70 text-sm mb-1">{cart.length} {cart.length === 1 ? 'producto' : 'productos'}</p>
                  <p className="text-4xl font-bold tracking-tight">S/ {total.toFixed(2)}</p>
                </div>
                <button onClick={() => setShowCheckout(false)} className="p-2 rounded-xl hover:bg-white/20 transition-colors mt-1">
                  <X size={20} />
                </button>
              </div>
              <div className="flex justify-between mt-1 text-xs text-white/60">
                <span>Base imponible: S/ {(subtotal / (1 + IGV_RATE)).toFixed(2)}</span>
                <span>IGV 18%: S/ {(subtotal - subtotal / (1 + IGV_RATE)).toFixed(2)}</span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

              {/* 1. Cliente */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cliente</span>
                  <span className="text-xs text-gray-400 font-normal normal-case">opcional</span>
                </div>
                <select
                  value={clientId}
                  onChange={(e) => { setClientId(e.target.value); if (!e.target.value) setIsCredit(false); }}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400 bg-white"
                >
                  <option value="">— Consumidor final —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="border-t border-gray-100" />

              {/* 2. Comprobante */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Comprobante</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['NONE', 'BOLETA', 'FACTURA'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVoucherType(v)}
                      className={`py-3 rounded-xl text-sm font-semibold transition-colors border-2 ${
                        voucherType === v
                          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:bg-primary-50'
                      }`}
                    >
                      {v === 'NONE' ? 'Ninguno' : v === 'BOLETA' ? 'Boleta' : 'Factura'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* 3. Tipo de pago */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Tipo de pago</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCredit(false)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-colors border-2 flex items-center justify-center gap-2 ${
                      !isCredit ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:bg-primary-50'
                    }`}
                  >
                    <CreditCard size={16} /> Pago inmediato
                  </button>
                  <button
                    type="button"
                    disabled={!clientId}
                    onClick={() => setIsCredit(true)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-colors border-2 flex items-center justify-center gap-2 ${
                      isCredit ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:bg-orange-50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Landmark size={16} /> A crédito
                  </button>
                </div>
                {!clientId && (
                  <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                    <User size={11} /> Selecciona un cliente para habilitar el pago a crédito
                  </p>
                )}
              </div>

              {/* Crédito — cuenta */}
              {isCredit && (
                <>
                  <div className="border-t border-gray-100" />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">4</span>
                      <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cuenta de crédito</span>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => { setCreditAccountId('new'); setCreditName(''); }}
                        className={`w-full px-4 py-3 rounded-xl text-sm font-semibold border-2 text-left transition-colors ${
                          creditAccountId === 'new' ? 'bg-orange-50 border-orange-400 text-orange-800' : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300'
                        }`}
                      >
                        + Nueva cuenta
                      </button>
                      {(openCredits as CreditAccount[] | undefined)?.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setCreditAccountId(acc.id)}
                          className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                            creditAccountId === acc.id ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-200 hover:border-orange-300'
                          }`}
                        >
                          <div className="font-semibold text-gray-800">{acc.name || 'Sin nombre'}</div>
                          <div className="text-sm text-red-500 mt-0.5">Deuda actual: S/ {acc.pendingAmount.toFixed(2)}</div>
                        </button>
                      ))}
                    </div>
                    {creditAccountId === 'new' && (
                      <input
                        value={creditName}
                        onChange={(e) => setCreditName(e.target.value)}
                        placeholder="Nombre de la cuenta  (ej: Tomates, Maíz)"
                        className="mt-3 w-full px-4 py-3 border-2 border-orange-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}

              {/* Pago inmediato — métodos */}
              {!isCredit && (
                <>
                  <div className="border-t border-gray-100" />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">4</span>
                      <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Método de pago</span>
                    </div>
                    <div className="space-y-3">
                      {splitPayments.map((p, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {paymentMethods.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => { const next = [...splitPayments]; next[idx] = { ...next[idx], paymentMethodId: m.id }; setSplitPayments(next); }}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border-2 ${getPaymentMethodColors(m.name, p.paymentMethodId === m.id)}`}
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">S/</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={p.amount || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => { const next = [...splitPayments]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setSplitPayments(next); }}
                                placeholder="0.00"
                                className="w-full pl-9 pr-3 py-3 border-2 border-gray-200 rounded-xl text-base text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400 bg-white"
                              />
                            </div>
                            {splitPayments.length > 1 && (
                              <button type="button" onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50">
                                <X size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Estado del pago */}
                    {splitPayments.length > 0 && (
                      <div className={`mt-3 rounded-xl px-4 py-3 flex items-center justify-between ${
                        Math.abs(splitRemaining) <= 0.01 ? 'bg-green-50 border-2 border-green-200' :
                        splitRemaining > 0 ? 'bg-orange-50 border-2 border-orange-200' : 'bg-blue-50 border-2 border-blue-200'
                      }`}>
                        <span className={`font-bold text-base ${Math.abs(splitRemaining) <= 0.01 ? 'text-green-700' : splitRemaining > 0 ? 'text-orange-700' : 'text-blue-700'}`}>
                          {Math.abs(splitRemaining) <= 0.01 ? '✓ Pago completo' : splitRemaining > 0 ? `Falta S/ ${splitRemaining.toFixed(2)}` : `Vuelto S/ ${Math.abs(splitRemaining).toFixed(2)}`}
                        </span>
                        {splitRemaining > 0.01 && (
                          <button type="button" onClick={() => {
                            const idx = splitPayments.findIndex(p => p.amount === 0);
                            if (idx >= 0) { const next = [...splitPayments]; next[idx] = { ...next[idx], amount: splitRemaining }; setSplitPayments(next); }
                            else { const last = splitPayments.length - 1; const next = [...splitPayments]; next[last] = { ...next[last], amount: (next[last].amount || 0) + splitRemaining }; setSplitPayments(next); }
                          }} className="text-sm font-bold text-orange-700 hover:text-orange-900 underline underline-offset-2">
                            Completar →
                          </button>
                        )}
                      </div>
                    )}

                    {paymentMethods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const used = new Set(splitPayments.map(p => p.paymentMethodId));
                          const next = paymentMethods.find(m => !used.has(m.id)) || paymentMethods[0];
                          if (!next) return;
                          setSplitPayments([...splitPayments, { paymentMethodId: next.id, amount: Math.max(0, splitRemaining) }]);
                        }}
                        className="mt-3 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                      >
                        + Agregar método de pago
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-5 border-t-2 border-gray-100 shrink-0">
              <button
                onClick={confirmSale}
                disabled={createSale.isPending}
                className={`w-full py-4 text-white rounded-xl disabled:opacity-50 font-bold text-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${
                  isCredit ? 'bg-orange-500 hover:bg-orange-600' : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {isCredit ? <Landmark size={20} /> : <CreditCard size={20} />}
                {createSale.isPending ? 'Procesando…' : isCredit ? `Registrar a Crédito · S/ ${total.toFixed(2)}` : `Confirmar Venta · S/ ${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mobile overlay */}
      {cartOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setCartOpen(false)}
        />
      )}

      {/* Mobile FAB — open cart */}
      <button
        onClick={() => setCartOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 left-4 z-20 py-3.5 bg-gray-900 text-white rounded-2xl shadow-xl flex items-center justify-between px-5 active:scale-95 transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingCart size={22} />
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {cart.length > 9 ? '9+' : cart.length}
              </span>
            )}
          </div>
          <span className="font-semibold text-sm">
            {cart.length === 0 ? 'Carrito vacío' : `${cart.length} ${cart.length === 1 ? 'producto' : 'productos'}`}
          </span>
        </div>
        <span className="text-lg font-bold">S/ {total.toFixed(2)}</span>
      </button>
    </div>
  );
}
