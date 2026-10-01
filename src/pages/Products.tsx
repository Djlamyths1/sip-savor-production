import { useEffect, useState, useCallback } from 'react';
import {
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  ArrowUpFromLine,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type Product, type FinishedGoodsTransaction } from '@/lib/types';
import { FINISHED_ADJUSTMENT_REASONS } from '@/lib/constants';
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import Modal from '@/components/Modal';
import { formatCurrency, formatNumber } from '@/lib/utils';

export default function Products() {
  const [products, setProducts] = useState<(Product & { current_stock: number; cost_per_unit: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showStockOut, setShowStockOut] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<(Product & { current_stock: number }) | null>(null);

  const load = useCallback(async () => {
    const { data: prods, error } = await supabase.from('products').select('*').order('name');
    if (error || !prods) { setLoading(false); return; }

    const enriched = await Promise.all(
      prods.map(async (p: Product) => {
        const { data: txns } = await supabase
          .from('finished_goods_transactions')
          .select('qty, type')
          .eq('product_id', p.id);
        const stock = (txns || []).reduce(
          (sum: number, t: { qty: number; type: string }) => sum + Number(t.qty || 0),
          0
        );
        const { data: recipe } = await supabase
          .from('recipe_items')
          .select('qty_required, material_id')
          .eq('product_id', p.id);

        const materialIds = (recipe || []).map((r) => r.material_id).filter(Boolean);

        let materialCosts: Record<string, number> = {};

        if (materialIds.length > 0) {
          const { data: materials } = await supabase
            .from('raw_materials')
            .select('id, unit_cost')
            .in('id', materialIds);

          materialCosts = Object.fromEntries(
            (materials || []).map((m) => [m.id, Number(m.unit_cost || 0)])
          );
        }

        const cost = (recipe || []).reduce(
          (sum: number, r: { qty_required: number; material_id: string }) =>
            sum +
            Number(r.qty_required || 0) *
            Number(materialCosts[r.material_id] || 0),
          0
        );
        return { ...p, current_stock: stock, cost_per_unit: cost };
      })
    );
    setProducts(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product? This will also delete its recipe and transaction history.')) return;
    await supabase.from('products').delete().eq('id', id);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Manage your finished goods, selling prices, and stock-out logging"
        action={
          <Button onClick={() => { setEditingProduct(null); setShowAdd(true); }}>
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        }
      />

      {products.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ShoppingBag}
            title="No products yet"
            message="Add your first finished product to start tracking production and sales."
            action={
              <Button onClick={() => { setEditingProduct(null); setShowAdd(true); }}>
                <Plus className="w-4 h-4" /> Add Product
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const margin = p.selling_price - p.cost_per_unit;
            const marginPct = p.selling_price > 0 ? (margin / p.selling_price) * 100 : 0;
            return (
              <Card key={p.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-stone-900">{p.name}</h3>
                    {p.variant && <p className="text-xs text-stone-400 mt-0.5">{p.variant}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingProduct(p); setShowAdd(true); }}
                      className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-stone-50 rounded-lg p-2.5">
                    <p className="text-xs text-stone-500">Selling Price</p>
                    <p className="text-sm font-bold text-stone-900">{formatCurrency(p.selling_price)}</p>
                  </div>
                  <div className="bg-stone-50 rounded-lg p-2.5">
                    <p className="text-xs text-stone-500">In Stock</p>
                    <p className="text-sm font-bold text-stone-900">{formatNumber(p.current_stock)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-stone-500">Cost/unit: {formatCurrency(p.cost_per_unit)}</span>
                  <Badge color={marginPct >= 30 ? 'green' : marginPct >= 10 ? 'amber' : 'red'}>
                    {marginPct.toFixed(0)}% margin
                  </Badge>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setSelectedProduct(p); setShowStockOut(true); }}
                  className="mt-auto"
                  disabled={p.current_stock <= 0}
                >
                  <ArrowUpFromLine className="w-4 h-4" /> Log Stock Out
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddEditProductModal
          product={editingProduct}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}

      {showStockOut && selectedProduct && (
        <StockOutModal
          product={selectedProduct}
          onClose={() => setShowStockOut(false)}
          onSaved={() => { setShowStockOut(false); load(); }}
        />
      )}
    </div>
  );
}

function AddEditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name || '');
  const [variant, setVariant] = useState(product?.variant || '');
  const [sellingPrice, setSellingPrice] = useState(product ? String(product.selling_price) : '0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (!name.trim()) {
        setError('Name is required');
        setSaving(false);
        return;
      }
      const payload = {
        name: name.trim(),
        variant: variant.trim(),
        selling_price: parseFloat(sellingPrice) || 0,
      };
      if (product) {
        const { error: e } = await supabase.from('products').update(payload).eq('id', product.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('products').insert(payload);
        if (e) throw e;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit Product' : 'Add Product'}>
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={setName} placeholder="e.g. Mango Smoothie" required />
        <Input label="Variant (optional)" value={variant} onChange={setVariant} placeholder="e.g. 500ml, Large" />
        <Input label="Selling Price (NGN)" type="number" value={sellingPrice} onChange={setSellingPrice} step="0.01" min="0" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : product ? 'Update' : 'Add Product'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function StockOutModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product & { current_stock: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState('');
  const [type, setType] = useState('sale');
  const [reason, setReason] = useState('Sale');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const qtyNum = Number(qty);

      if (!Number.isInteger(qtyNum)) {
        setError('Quantity must be a whole number.');
        setSaving(false);
        return;
      }

      if (!qtyNum || qtyNum <= 0) {
        setError('Quantity must be greater than 0');
        setSaving(false);
        return;
      }

      if (qtyNum > product.current_stock) {
        setError(`Only ${product.current_stock} in stock`);
        setSaving(false);
        return;
      }
      const { error: e } = await supabase.rpc('log_finished_stock_out', {
        p_product_id: product.id,
        p_qty: qtyNum,
        p_type: type,
        p_reason: reason || null,
      });
      if (e) throw e;
      onSaved();
    } catch (err: unknown) {
      console.error('Failed to log stock-out:', err);

      const rpcError = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      const errorParts = [
        rpcError.message,
        rpcError.details,
        rpcError.hint,
      ].filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      );

      setError(
        errorParts.length > 0
          ? errorParts.join(' ')
          : 'Failed to log stock-out'
      );

      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Log Stock Out: ${product.name}`}>
      <div className="space-y-4">
        <div className="bg-emerald-50 rounded-lg p-3 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-emerald-800">
            Current stock: {formatNumber(product.current_stock)} units
          </span>
        </div>
        <Input label="Quantity" type="number" value={qty} onChange={setQty} step="1" min="0" placeholder="0" required />
        <Select
          label="Type"
          value={type}
          onChange={setType}
          options={[{ value: 'sale', label: 'Sale' }, { value: 'adjustment', label: 'Adjustment' }]}
        />
        <Select label="Reason" value={reason} onChange={setReason} options={FINISHED_ADJUSTMENT_REASONS} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Log Stock Out'}</Button>
        </div>
      </div>
    </Modal>
  );
}



