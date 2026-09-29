import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  Plus,
  ArrowDownToLine,
  SlidersHorizontal,
  Trash2,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type RawMaterial } from '@/lib/types';
import { CATEGORIES, UNITS, ADJUSTMENT_REASONS } from '@/lib/constants';
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

export default function RawMaterials() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showStockIn, setShowStockIn] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<RawMaterial | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('raw_materials')
      .select('*')
      .order('name', { ascending: true });
    if (!error && data) setMaterials(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this raw material? This will also delete all its transaction history.')) return;
    await supabase.from('raw_materials').delete().eq('id', id);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Raw Materials"
        subtitle="Manage your raw material inventory, stock levels, and adjustments"
        action={
          <Button onClick={() => { setEditingMaterial(null); setShowAdd(true); }}>
            <Plus className="w-4 h-4" /> Add Material
          </Button>
        }
      />

      {materials.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Package}
            title="No raw materials yet"
            message="Add your first raw material to start tracking stock levels, purchases, and adjustments."
            action={
              <Button onClick={() => { setEditingMaterial(null); setShowAdd(true); }}>
                <Plus className="w-4 h-4" /> Add Material
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Category</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">In Stock</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Unit Cost</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Value</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {materials.map((m) => {
                  const isLow = m.current_qty <= m.reorder_threshold;
                  const isOutOfStock = m.current_qty <= 0;
                  return (
                    <tr key={m.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-stone-900">{m.name}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-stone-600">{m.category}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-medium text-stone-900">
                          {formatNumber(m.current_qty)} {m.unit}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm text-stone-600">{formatCurrency(m.unit_cost)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-medium text-stone-900">
                          {formatCurrency(m.current_qty * m.unit_cost)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isOutOfStock ? (
                          <Badge color="red">Out of stock</Badge>
                        ) : isLow ? (
                          <Badge color="amber"><AlertTriangle className="w-3 h-3" /> Low</Badge>
                        ) : (
                          <Badge color="green">In stock</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setSelectedMaterial(m); setShowStockIn(true); }}
                            title="Stock In"
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setSelectedMaterial(m); setShowAdjust(true); }}
                            title="Adjust"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setEditingMaterial(m); setShowAdd(true); }}
                            title="Edit"
                            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
                            title="Delete"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add/Edit Material Modal */}
      {showAdd && (
        <AddEditMaterialModal
          material={editingMaterial}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}

      {/* Stock In Modal */}
      {showStockIn && selectedMaterial && (
        <StockInModal
          material={selectedMaterial}
          onClose={() => setShowStockIn(false)}
          onSaved={() => { setShowStockIn(false); load(); }}
        />
      )}

      {/* Adjustment Modal */}
      {showAdjust && selectedMaterial && (
        <AdjustModal
          material={selectedMaterial}
          onClose={() => setShowAdjust(false)}
          onSaved={() => { setShowAdjust(false); load(); }}
        />
      )}
    </div>
  );
}

function AddEditMaterialModal({
  material,
  onClose,
  onSaved,
}: {
  material: RawMaterial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(material?.name || '');
  const [unit, setUnit] = useState(material?.unit || 'kg');
  const [category, setCategory] = useState(material?.category || 'Fruits & Ingredients');
  const [currentQty, setCurrentQty] = useState(material ? String(material.current_qty) : '0');
  const [reorderThreshold, setReorderThreshold] = useState(material ? String(material.reorder_threshold) : '0');
  const [unitCost, setUnitCost] = useState(material ? String(material.unit_cost) : '0');
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
        unit,
        category,
        current_qty: parseFloat(currentQty) || 0,
        reorder_threshold: parseFloat(reorderThreshold) || 0,
        unit_cost: parseFloat(unitCost) || 0,
      };
      if (material) {
        const { error: e } = await supabase.from('raw_materials').update(payload).eq('id', material.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('raw_materials').insert(payload);
        if (e) throw e;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={material ? 'Edit Material' : 'Add Raw Material'}>
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={setName} placeholder="e.g. Fresh Mangoes" required />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Unit" value={unit} onChange={setUnit} options={UNITS} />
          <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Current Quantity" type="number" value={currentQty} onChange={setCurrentQty} step="0.01" min="0" />
          <Input label="Reorder Threshold" type="number" value={reorderThreshold} onChange={setReorderThreshold} step="0.01" min="0" />
        </div>
        <Input label="Unit Cost (NGN)" type="number" value={unitCost} onChange={setUnitCost} step="0.01" min="0" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : material ? 'Update' : 'Add Material'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StockInModal({
  material,
  onClose,
  onSaved,
}: {
  material: RawMaterial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(String(material.unit_cost));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const qtyNum = parseFloat(qty);
      const costNum = parseFloat(unitCost);
      if (!qtyNum || qtyNum <= 0) {
        setError('Quantity must be greater than 0');
        setSaving(false);
        return;
      }
      const { error: e } = await supabase.rpc('log_stock_in', {
        p_material_id: material.id,
        p_qty: qtyNum,
        p_unit_cost: costNum,
        p_expense_date: date,
        p_vendor: vendor || null,
        p_payment_method: paymentMethod,
        p_description: description || null,
      });
      if (e) throw e;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log stock-in');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Stock In: ${material.name}`}>
      <div className="space-y-4">
        <div className="bg-amber-50 rounded-lg p-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-800">
            Current stock: {formatNumber(material.current_qty)} {material.unit}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Quantity" type="number" value={qty} onChange={setQty} step="0.01" min="0" placeholder="0" required />
          <Input label={`Unit Cost (NGN/${material.unit})`} type="number" value={unitCost} onChange={setUnitCost} step="0.01" min="0" />
        </div>
        <Input label="Date" type="date" value={date} onChange={setDate} />
        <Input label="Vendor (optional)" value={vendor} onChange={setVendor} placeholder="Supplier name" />
        <Select label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque']} />
        <Input label="Notes (optional)" value={description} onChange={setDescription} placeholder="Additional details" />
        {qty && unitCost && (
          <div className="bg-stone-50 rounded-lg p-3">
            <p className="text-sm text-stone-600">Total cost: <span className="font-semibold text-stone-900">{formatCurrency(parseFloat(qty) * parseFloat(unitCost))}</span></p>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Log Stock In'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({
  material,
  onClose,
  onSaved,
}: {
  material: RawMaterial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qtyChange, setQtyChange] = useState('');
  const [reason, setReason] = useState('Spoilage');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const qtyNum = parseFloat(qtyChange);
      if (!qtyNum || qtyNum === 0) {
        setError('Quantity change must not be zero');
        setSaving(false);
        return;
      }
      const { error: e } = await supabase.rpc('log_adjustment', {
        p_material_id: material.id,
        p_qty_change: qtyNum,
        p_reason: reason,
      });
      if (e) throw e;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log adjustment');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Adjust Stock: ${material.name}`}>
      <div className="space-y-4">
        <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-800">
            Current stock: {formatNumber(material.current_qty)} {material.unit}
          </span>
        </div>
        <Input
          label="Quantity Change (use negative for loss)"
          type="number"
          value={qtyChange}
          onChange={setQtyChange}
          step="0.01"
          placeholder="e.g. -2.5 or 1"
          required
        />
        <Select label="Reason" value={reason} onChange={setReason} options={ADJUSTMENT_REASONS} />
        {qtyChange && (
          <div className="bg-stone-50 rounded-lg p-3">
            <p className="text-sm text-stone-600">
              New stock will be: <span className="font-semibold text-stone-900">
                {formatNumber(material.current_qty + parseFloat(qtyChange))} {material.unit}
              </span>
            </p>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Log Adjustment'}</Button>
        </div>
      </div>
    </Modal>
  );
}
