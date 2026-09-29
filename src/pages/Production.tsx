import { useEffect, useState, useCallback } from 'react';
import { Factory, Plus, CheckCircle, XCircle, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type Product, type RawMaterial, type RecipeItem, type FinishedGoodsTransaction } from '@/lib/types';
import {
  Card,
  Button,
  Select,
  Input,
  Badge,
  Spinner,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import Modal from '@/components/Modal';
import { formatNumber, formatDate } from '@/lib/utils';

interface RecipeWithMaterial extends RecipeItem {
  raw_materials: RawMaterial;
}

interface ProductionLog extends FinishedGoodsTransaction {
  products: { name: string; variant: string };
}

export default function Production() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [editingLog, setEditingLog] = useState<ProductionLog | null>(null);
  const [logs, setLogs] = useState<ProductionLog[]>([]);

  const load = useCallback(async () => {
    const [prodRes, logRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase
        .from('finished_goods_transactions')
        .select('*, products(name, variant)')
        .eq('type', 'production')
        .order('date', { ascending: false })
        .limit(20),
    ]);
    setProducts(prodRes.data || []);
    setLogs(logRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (log: ProductionLog) => {
    if (!confirm(`Delete this production run?\n\nProduct: ${log.products.name}${log.products.variant ? ` (${log.products.variant})` : ''}\nQty: ${formatNumber(log.qty)}\n\nRaw materials will be restored to stock.`)) return;
    const { error } = await supabase.rpc('reverse_production', { p_fgt_id: log.id });
    if (error) {
      alert('Failed to delete production run: ' + error.message);
      return;
    }
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle="Log production runs — raw materials are automatically deducted based on the recipe"
        action={
          <Button onClick={() => setShowLog(true)} disabled={products.length === 0}>
            <Plus className="w-4 h-4" /> Log Production
          </Button>
        }
      />

      {products.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Factory}
            title="No products available"
            message="Add products and set up their recipes before logging production runs."
          />
        </Card>
      ) : logs.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Factory}
            title="No production runs logged yet"
            message="Log your first production run to automatically deduct raw materials and add finished goods to stock."
            action={
              <Button onClick={() => setShowLog(true)}>
                <Plus className="w-4 h-4" /> Log Production
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Product</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty Produced</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Reason</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-sm text-stone-600">{formatDate(log.date)}</td>
                    <td className="px-5 py-3">
                      <span className="font-medium text-stone-900">{log.products.name}</span>
                      {log.products.variant && <span className="text-stone-400 text-sm ml-2">{log.products.variant}</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Badge color="green"><CheckCircle className="w-3 h-3" /> +{formatNumber(log.qty)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-stone-500">{log.reason || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingLog(log)}
                          className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
                          title="Edit production run"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(log)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                          title="Delete production run"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showLog && (
        <LogProductionModal
          products={products}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); load(); }}
        />
      )}

      {editingLog && (
        <EditProductionModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onSaved={() => { setEditingLog(null); load(); }}
        />
      )}
    </div>
  );
}

function LogProductionModal({
  products,
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [recipe, setRecipe] = useState<RecipeWithMaterial[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadRecipe() {
      if (!productId) {
        setRecipe([]);
        return;
      }
      setLoadingRecipe(true);
      const { data } = await supabase
        .from('recipe_items')
        .select('*, raw_materials!inner(*)')
        .eq('product_id', productId);
      setRecipe((data as RecipeWithMaterial[]) || []);
      setLoadingRecipe(false);
    }
    loadRecipe();
  }, [productId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const qtyNum = parseFloat(qty);
      if (!qtyNum || qtyNum <= 0) {
        setError('Quantity must be greater than 0');
        setSaving(false);
        return;
      }
      const { data, error: e } = await supabase.rpc('log_production', {
        p_product_id: productId,
        p_qty_produced: qtyNum,
        p_production_date: date,
      });
      if (e) throw e;
      const result = data as { success: boolean; message: string }[] | null;
      if (result && result[0] && !result[0].success) {
        setError(result[0].message);
        setSaving(false);
        return;
      }
      setSuccess(result?.[0]?.message || 'Production logged successfully');
      setTimeout(() => onSaved(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log production');
      setSaving(false);
    }
  };

  const qtyNum = parseFloat(qty) || 0;

  return (
    <Modal open onClose={onClose} title="Log Production Run">
      <div className="space-y-4">
        <Select
          label="Product"
          value={productId}
          onChange={setProductId}
          options={products.map((p) => ({
            value: p.id,
            label: p.name + (p.variant ? ` (${p.variant})` : ''),
          }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Quantity to Produce" type="number" value={qty} onChange={setQty} step="0.01" min="0" placeholder="0" required />
          <Input label="Date" type="date" value={date} onChange={setDate} />
        </div>

        {loadingRecipe && <p className="text-sm text-stone-500">Loading recipe...</p>}

        {recipe.length === 0 && !loadingRecipe && (
          <div className="bg-amber-50 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800">
              This product has no recipe defined. No raw materials will be deducted.
              Go to the Recipes page to add ingredients.
            </p>
          </div>
        )}

        {recipe.length > 0 && qtyNum > 0 && (
          <div className="bg-stone-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-stone-700 mb-2">Materials to be deducted:</h4>
            <div className="space-y-1.5">
              {recipe.map((r) => {
                const needed = r.qty_required * qtyNum;
                const hasStock = r.raw_materials.current_qty >= needed;
                return (
                  <div key={r.material_id} className="flex items-center justify-between text-sm">
                    <span className="text-stone-600">
                      {r.raw_materials.name}
                      <span className="text-stone-400 ml-1">
                        ({formatNumber(r.qty_required)} × {qtyNum})
                      </span>
                    </span>
                    <span className={hasStock ? 'text-stone-900 font-medium' : 'text-red-600 font-medium'}>
                      {formatNumber(needed)} {r.raw_materials.unit}
                      {!hasStock && <XCircle className="w-3 h-3 inline ml-1" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <p className="text-sm text-emerald-800">{success}</p>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !qty}>
            {saving ? 'Logging...' : 'Log Production'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditProductionModal({
  log,
  onClose,
  onSaved,
}: {
  log: ProductionLog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState(String(log.qty));
  const [date, setDate] = useState(log.date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const qtyNum = parseFloat(qty);
      if (!qtyNum || qtyNum <= 0) {
        setError('Quantity must be greater than 0');
        setSaving(false);
        return;
      }
      const { data, error: e } = await supabase.rpc('update_production', {
        p_fgt_id: log.id,
        p_new_qty: qtyNum,
        p_new_date: date,
      });
      if (e) throw e;
      const result = data as { success: boolean; message: string }[] | null;
      if (result && result[0] && !result[0].success) {
        setError(result[0].message);
        setSaving(false);
        return;
      }
      setSuccess(result?.[0]?.message || 'Production run updated');
      setTimeout(() => onSaved(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update production run');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit Production Run">
      <div className="space-y-4">
        <div className="bg-stone-50 rounded-lg p-4">
          <p className="text-sm text-stone-500 mb-1">Product</p>
          <p className="font-medium text-stone-900">
            {log.products.name}
            {log.products.variant && <span className="text-stone-400 text-sm ml-2">{log.products.variant}</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Quantity Produced" type="number" value={qty} onChange={setQty} step="0.01" min="0" placeholder="0" required />
          <Input label="Date" type="date" value={date} onChange={setDate} />
        </div>
        <div className="bg-amber-50 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">
            Editing a production run will reverse the original raw material deductions and re-deduct based on the new quantity. Make sure you have sufficient stock.
          </p>
        </div>
        {success && (
          <div className="bg-emerald-50 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <p className="text-sm text-emerald-800">{success}</p>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !qty}>
            {saving ? 'Updating...' : 'Update Production'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
