import { useEffect, useState, useCallback } from 'react';
import { ChefHat, Plus, Trash2, Save, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type Product, type RawMaterial, type RecipeItem } from '@/lib/types';
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
import { formatCurrency, formatNumber } from '@/lib/utils';

interface RecipeWithMaterial extends RecipeItem {
  raw_materials: RawMaterial;
}

export default function Recipes() {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [recipe, setRecipe] = useState<RecipeWithMaterial[]>([]);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newMaterialId, setNewMaterialId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [prodRes, matRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('raw_materials').select('*').order('name'),
      ]);
      setProducts(prodRes.data || []);
      setMaterials(matRes.data || []);
      if (prodRes.data && prodRes.data.length > 0) {
        setSelectedProductId(prodRes.data[0].id);
      }
      setLoading(false);
    }
    load();
  }, []);

  const loadRecipe = useCallback(async (productId: string) => {
    if (!productId) {
      setRecipe([]);
      return;
    }
    const { data } = await supabase
      .from('recipe_items')
      .select('*, raw_materials!inner(*)')
      .eq('product_id', productId);
    setRecipe((data as RecipeWithMaterial[]) || []);
  }, []);

  useEffect(() => {
    loadRecipe(selectedProductId);
  }, [selectedProductId, loadRecipe]);

  const handleAddIngredient = async () => {
    if (!newMaterialId || !newQty) return;
    setSaving(true);
    const { error } = await supabase.from('recipe_items').insert({
      product_id: selectedProductId,
      material_id: newMaterialId,
      qty_required: parseFloat(newQty),
    });
    if (!error) {
      setNewMaterialId('');
      setNewQty('');
      setShowAddRow(false);
      loadRecipe(selectedProductId);
    }
    setSaving(false);
  };

  const handleRemoveIngredient = async (materialId: string) => {
    const { error } = await supabase
      .from('recipe_items')
      .delete()
      .eq('product_id', selectedProductId)
      .eq('material_id', materialId);
    if (!error) loadRecipe(selectedProductId);
  };

  const handleUpdateQty = async (materialId: string, qty: string) => {
    const { error } = await supabase
      .from('recipe_items')
      .update({ qty_required: parseFloat(qty) })
      .eq('product_id', selectedProductId)
      .eq('material_id', materialId);
    if (!error) loadRecipe(selectedProductId);
  };

  if (loading) return <Spinner />;

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const totalCost = recipe.reduce(
    (sum, r) => sum + r.qty_required * r.raw_materials.unit_cost,
    0
  );
  const margin = selectedProduct ? selectedProduct.selling_price - totalCost : 0;
  const marginPct = selectedProduct && selectedProduct.selling_price > 0
    ? (margin / selectedProduct.selling_price) * 100
    : 0;

  return (
    <div>
      <PageHeader
        title="Recipes"
        subtitle="Define the ingredient list (bill of materials) for each finished product"
      />

      {products.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ChefHat}
            title="No products to build recipes for"
            message="Add products first, then come back to define their ingredient lists."
          />
        </Card>
      ) : materials.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Package}
            title="No raw materials available"
            message="Add raw materials first so you can include them in recipes."
          />
        </Card>
      ) : (
        <>
          <Card className="p-5 mb-6">
            <Select
              label="Select Product"
              value={selectedProductId}
              onChange={setSelectedProductId}
              options={products.map((p) => ({
                value: p.id,
                label: p.name + (p.variant ? ` (${p.variant})` : ''),
              }))}
            />
          </Card>

          {selectedProduct && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="p-4">
                  <p className="text-xs text-stone-500">Selling Price</p>
                  <p className="text-xl font-bold text-stone-900 mt-1">{formatCurrency(selectedProduct.selling_price)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-stone-500">Cost per Unit</p>
                  <p className="text-xl font-bold text-stone-900 mt-1">{formatCurrency(totalCost)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-stone-500">Profit Margin</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xl font-bold text-stone-900">{formatCurrency(margin)}</p>
                    <Badge color={marginPct >= 30 ? 'green' : marginPct >= 10 ? 'amber' : 'red'}>
                      {marginPct.toFixed(0)}%
                    </Badge>
                  </div>
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="font-semibold text-stone-900">Ingredients</h3>
                  <Button size="sm" variant="secondary" onClick={() => setShowAddRow(!showAddRow)}>
                    <Plus className="w-4 h-4" /> Add Ingredient
                  </Button>
                </div>

                {showAddRow && (
                  <div className="px-5 py-4 bg-stone-50 border-b border-stone-100">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <Select
                          label="Raw Material"
                          value={newMaterialId}
                          onChange={setNewMaterialId}
                          options={materials.map((m) => ({
                            value: m.id,
                            label: `${m.name} (${m.unit})`,
                          }))}
                          placeholder="Select material"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input label="Qty Needed" type="number" value={newQty} onChange={setNewQty} step="0.01" min="0" placeholder="0" />
                        </div>
                        <Button onClick={handleAddIngredient} disabled={saving || !newMaterialId || !newQty} className="mb-0.5">
                          <Save className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {recipe.length === 0 && !showAddRow ? (
                  <EmptyState
                    icon={ChefHat}
                    title="No ingredients added"
                    message="Add raw materials to define the recipe for this product."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Ingredient</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Unit</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty Needed</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Unit Cost</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Subtotal</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {recipe.map((r) => (
                          <tr key={r.material_id} className="hover:bg-stone-50/50">
                            <td className="px-5 py-3 font-medium text-stone-900">{r.raw_materials.name}</td>
                            <td className="px-5 py-3 text-sm text-stone-600">{r.raw_materials.unit}</td>
                            <td className="px-5 py-3 text-right">
                              <input
                                type="number"
                                defaultValue={r.qty_required}
                                step="0.01"
                                min="0"
                                onBlur={(e) => {
                                  if (parseFloat(e.target.value) !== r.qty_required) {
                                    handleUpdateQty(r.material_id, e.target.value);
                                  }
                                }}
                                className="w-20 px-2 py-1 text-right rounded border border-stone-200 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            </td>
                            <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(r.raw_materials.unit_cost)}</td>
                            <td className="px-5 py-3 text-right text-sm font-medium text-stone-900">
                              {formatCurrency(r.qty_required * r.raw_materials.unit_cost)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => handleRemoveIngredient(r.material_id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {recipe.length > 0 && (
                        <tfoot>
                          <tr className="bg-stone-50 border-t border-stone-200">
                            <td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total Cost per Unit:</td>
                            <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(totalCost)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
