import { useEffect, useState, useCallback } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  TrendingUp,
  Coins,
  Receipt,
  Printer,
  Download,
  Truck,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/context/PermissionContext';
import { type Product, type Sale, type FinishedGoodsTransaction, type Customer } from '@/lib/types';
import { PAYMENT_METHODS, SALE_PAYMENT_STATUS, DELIVERY_METHODS, NIGERIAN_STATES } from '@/lib/constants';
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  EmptyState,
  PageHeader,
  StatCard,
} from '@/components/ui';
import Modal from '@/components/Modal';
import { formatCurrency, formatNumber, formatDate, downloadCSV, downloadExcel, printReport } from '@/lib/utils';

interface SaleWithProduct {
  id: string;
  invoice_number: string;
  sale_date: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  delivery_charge: number;
  grand_total: number;
  salesperson_id: string | null;
  payment_status: string;
  due_date: string | null;
  delivery_required: boolean;
  delivery_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  legacy_customer_name: string | null;
  linked_transaction_id: string | null;
  legacy_delivery_id: string | null;
  legacy_payment_method: string | null;
  user_id: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  // Compatibility fields used by the existing display/receipt code.
  date: string;
  customer_name: string | null;
  payment_method: string;
  total_amount: number;
  qty: number;
  unit_price: number;

  products: { name: string; variant: string | null } | null;
  customers: { name: string; state: string | null } | null;

  sale_items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    line_total: number;
    unit_cost: number;
    cogs: number;
    products: { name: string; variant: string | null } | null;
  }>;
}

export default function Sales() {
  const { hasPermission, canEnter, canView, canManage } = usePermissions();
  const canCreateSales = canEnter('sales.create');
  const canViewSalesHistory = canView('sales.view_history');
  const canEditSales = canManage('sales.edit');
  const canVoidSales = canManage('sales.void');
  const canPrintSalesReceipt = canView('sales.print_receipt');
  const canExportSales = canView('database_export.export');
  const [sales, setSales] = useState<SaleWithProduct[]>([]);
  const [products, setProducts] = useState<(Product & { current_stock: number })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleWithProduct | null>(null);
  const [editingSale, setEditingSale] = useState<SaleWithProduct | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [search, setSearch] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);

    const [prodRes, custRes] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .order('name'),

      supabase
        .from('customers')
        .select('*')
        .order('name'),
    ]);

    if (canViewSalesHistory) {
      const [saleRes, receivableRes] = await Promise.all([
        supabase
          .from('sales')
          .select(`
            *,
            customers(name, state),
            sale_items(
              id,
              product_id,
              quantity,
              unit_price,
              discount,
              line_total,
              unit_cost,
              cogs,
              products(name, variant)
            )
          `)
          .order('sale_date', { ascending: false })
          .limit(1000),

        supabase.rpc('get_total_receivables'),
      ]);

      if (saleRes.error) {
        console.error('Sales load error:', saleRes.error);
        setSales([]);
        setTotalRevenue(0);
        setTotalUnits(0);
        setTotalOutstanding(0);
      } else {
        const mappedSales: SaleWithProduct[] = (saleRes.data || []).map((sale: any) => {
          const items = Array.isArray(sale.sale_items) ? sale.sale_items : [];
          const firstItem = items[0] || null;

          const totalUnitsForInvoice = items.reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          );

          return {
            ...sale,

            // Compatibility fields for the existing UI.
            date: sale.sale_date,
            customer_name: sale.legacy_customer_name || sale.customers?.name || null,
            payment_method: sale.legacy_payment_method || '',
            total_amount: Number(sale.grand_total || 0),
            qty: totalUnitsForInvoice,
            unit_price: Number(firstItem?.unit_price || 0),

            products: firstItem?.products || null,
            customers: sale.customers || null,

            sale_items: items,
          };
        });

        setSales(mappedSales);

        setTotalRevenue(
          mappedSales.reduce(
            (sum, sale) => sum + Number(sale.grand_total || 0),
            0
          )
        );

        setTotalUnits(
          mappedSales.reduce(
            (sum, sale) => sum + Number(sale.qty || 0),
            0
          )
        );

        const receivable = receivableRes.data?.[0];
        setTotalOutstanding(Number(receivable?.total_receivables ?? 0));
      }
    } else {
      // Entry-only users must not load or receive sales history
      // or cumulative financial information.
      setSales([]);
      setTotalRevenue(0);
      setTotalUnits(0);
      setTotalOutstanding(0);
    }

    const prods = (prodRes.data || []) as Product[];

    const enriched = await Promise.all(
      prods.map(async (p) => {
        const { data: txns } = await supabase
          .from('finished_goods_transactions')
          .select('qty, type')
          .eq('product_id', p.id);

        const stock = (txns || []).reduce(
          (sum: number, t: { qty: number; type: string }) =>
            sum + Number(t.qty || 0),
          0
        );

        return {
          ...p,
          current_stock: stock,
        };
      })
    );

    setProducts(enriched);
    setCustomers((custRes.data || []) as Customer[]);
    setLoading(false);
  }, [canViewSalesHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string, _linkedTxnId: string | null) => {
    const reason = window.prompt('Enter the reason for voiding this sale:')?.trim();

    if (!reason) return;

    const { error } = await supabase.rpc('void_sale', {
      p_sale_id: id,
      p_void_reason: reason,
    });

    if (error) {
      window.alert(error.message);
      return;
    }

    await load();
  };

  const searchTerm = search.trim().toLowerCase();

  const filtered = searchTerm
    ? sales.filter((s) => {
        const productMatch = (s.sale_items || []).some((item) => {
          const productName = item.products?.name?.toLowerCase() || '';
          const variant = item.products?.variant?.toLowerCase() || '';

          return (
            productName.includes(searchTerm) ||
            variant.includes(searchTerm)
          );
        });

        const customerMatch =
          s.customer_name?.toLowerCase().includes(searchTerm) ||
          s.customers?.name?.toLowerCase().includes(searchTerm) ||
          s.customers?.state?.toLowerCase().includes(searchTerm);

        const invoiceMatch =
          s.invoice_number?.toLowerCase().includes(searchTerm);

        const paymentMatch =
          s.payment_method?.toLowerCase().includes(searchTerm) ||
          s.payment_status?.toLowerCase().includes(searchTerm);

        return (
          productMatch ||
          customerMatch ||
          invoiceMatch ||
          paymentMatch
        );
      })
    : sales;

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="Record sales transactions — stock is automatically deducted and revenue tracked"
action={
  <div className="flex gap-2">
    {canViewSalesHistory && canExportSales && (
      <Button variant="secondary" onClick={() => setShowDownload(true)}>
        <Download className="w-4 h-4" /> Download Sales
      </Button>
    )}

    {canCreateSales && (
      <Button onClick={() => setShowAdd(true)} disabled={products.length === 0}>
        <Plus className="w-4 h-4" /> Record Sale
      </Button>
    )}
  </div>
}
      />

  {canViewSalesHistory && (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={Coins}
          accent="emerald"
          subtitle={`${filtered.length} sales`}
        />
        <StatCard
          label="Units Sold"
          value={formatNumber(totalUnits)}
          icon={ShoppingCart}
          accent="amber"
        />
        <StatCard
          label="Avg Sale Value"
          value={formatCurrency(filtered.length > 0 ? totalRevenue / filtered.length : 0)}
          icon={TrendingUp}
          accent="blue"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          icon={Receipt}
          accent="red"
          subtitle="Unpaid invoices"
        />
      </div>
)}
            {canViewSalesHistory && (
  <>
    <div className="relative mb-4">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product, customer, invoice #, or payment method..."
          className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ShoppingCart}
            title="No sales recorded yet"
            message="Record your first sale to automatically deduct stock and track revenue."
            action={
              <Button onClick={() => setShowAdd(true)} disabled={products.length === 0}>
                <Plus className="w-4 h-4" /> Record Sale
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Invoice #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Products</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Items</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Total</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Status</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Del.</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Actions</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Receipt</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {filtered.map((s) => {
                  const items = s.sale_items || [];
                  const productNames = items
                    .map((item) => {
                      const name = item.products?.name || 'Unknown product';
                      const variant = item.products?.variant;
                      return variant ? `${name} (${variant})` : name;
                    })
                    .filter(Boolean);

                  const visibleProducts = productNames.slice(0, 3);
                  const remainingProducts = productNames.length - visibleProducts.length;

                  return (
                    <tr key={s.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 text-sm text-stone-600 whitespace-nowrap">
                        {formatDate(s.date)}
                      </td>

                      <td className="px-5 py-3 text-sm font-mono text-stone-700 whitespace-nowrap">
                        {s.invoice_number || s.id.slice(0, 8).toUpperCase()}
                      </td>

                      <td className="px-5 py-3 text-sm">
                        {visibleProducts.length > 0 ? (
                          <div className="space-y-0.5">
                            {visibleProducts.map((name, index) => (
                              <div key={`${s.id}-${index}`} className="font-medium text-stone-900">
                                {name}
                              </div>
                            ))}
                            {remainingProducts > 0 && (
                              <div className="text-xs text-stone-400">
                                + {remainingProducts} more product{remainingProducts === 1 ? '' : 's'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-400">No items</span>
                        )}
                      </td>

                      <td className="px-5 py-3 text-right text-sm">
                        {items.length}
                      </td>

                      <td className="px-5 py-3 text-right text-sm">
                        {formatNumber(s.qty)}
                      </td>

                      <td className="px-5 py-3 text-right font-semibold text-stone-900 whitespace-nowrap">
                        {formatCurrency(s.grand_total)}
                      </td>

                      <td className="px-5 py-3 text-sm text-stone-500">
                        {s.customer_name || s.customers?.name || '�'}
                        {s.customers?.state && (
                          <span className="text-stone-400 text-xs ml-1">
                            ({s.customers.state})
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3">
                        <PaymentStatusBadge status={s.payment_status} />
                      </td>

                      <td className="px-5 py-3 text-center">
                        {s.delivery_required && (
                          <Truck className="w-4 h-4 text-blue-500 mx-auto" />
                        )}
                      </td>
	
	
                    <td className="px-5 py-3 text-center">
  <div className="flex items-center justify-center gap-1">
    {canEditSales && (
      <button
        onClick={() => setEditingSale(s)}
        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
        title="Edit invoice"
      >
        <Pencil className="w-4 h-4" />
      </button>
    )}

    {canVoidSales && (
      <button
        onClick={() => handleDelete(s.id, s.linked_transaction_id)}
        className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
        title="Void invoice"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )}

    <button
      onClick={() => setReceiptSale(s)}
      className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
      title="Print receipt"
    >
      <Printer className="w-4 h-4" />
    </button>
  </div>
</td>
</tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">
                    Total Revenue:
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">
                    {formatCurrency(totalRevenue)}
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
        </>
  )}

      {showAdd && (
        <RecordSaleModal
          products={products}
          customers={customers}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
{editingSale && (
  <EditSaleModal
    sale={editingSale}
    products={products}
    customers={customers}
    onClose={() => setEditingSale(null)}
    onSaved={() => {
      setEditingSale(null);
      load();
    }}
  />
)}
      {receiptSale && (
        <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />
      )}

      {showDownload && (
        <DownloadSalesModal onClose={() => setShowDownload(false)} />
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'Paid') return <Badge color="green">Paid</Badge>;
  if (status === 'Partially Paid') return <Badge color="amber">Partially Paid</Badge>;
  if (status === 'Unpaid' || status === 'Credit') return <Badge color="red">Credit</Badge>;
  return <Badge color="stone">{status}</Badge>;
}

function ReceiptModal({
  sale,
  onClose,
}: {
  sale: SaleWithProduct;
  onClose: () => void;
}) {
  const currency = (value: number) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(Number(value || 0));

  const items = sale.sale_items || [];
  const automaticDiscount = items.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0
  );
  const invoiceDiscount = Math.max(
    0,
    Number(sale.discount || 0) - automaticDiscount
  );
  const subtotal = Number(sale.subtotal || 0);
  const deliveryCharge = Number(sale.delivery_charge || 0);
  const grandTotal = Number(sale.grand_total || 0);

  const handlePrint = () => {
    const itemRows = items
      .map((item) => {
        const productName = item.products?.name || 'Unknown product';
        const variant = item.products?.variant
          ? ` (${item.products.variant})`
          : '';

        return `
          <div class="item">
            <div class="item-name">${productName}${variant}</div>
            <div class="item-row">
              <span>${Number(item.quantity || 0)} x ${currency(Number(item.unit_price || 0))}</span>
              <span>${currency(Number(item.line_total || 0))}</span>
            </div>
            ${
              Number(item.discount || 0) > 0
                ? `<div class="item-discount">Discount: -${currency(Number(item.discount || 0))}</div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    const receiptHTML = `
      <html>
      <head>
        <title>Receipt - ${sale.invoice_number || 'Sale'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            width: 300px;
            margin: 0 auto;
            padding: 20px;
            color: #1c1917;
          }
          .header { text-align: center; margin-bottom: 16px; }
          .header h1 { font-size: 20px; font-weight: bold; }
          .header p { font-size: 11px; color: #78716c; margin-top: 2px; }
          .divider { border-top: 1px dashed #a8a29e; margin: 12px 0; }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 12px;
            margin-bottom: 4px;
          }
          .label { color: #57534e; }
          .value { font-weight: bold; }
          .item {
            margin-bottom: 10px;
          }
          .item-name {
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 3px;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 12px;
          }
          .item-discount {
            font-size: 10px;
            color: #047857;
            text-align: right;
            margin-top: 2px;
          }
          .total {
            font-size: 16px;
            font-weight: bold;
            margin-top: 8px;
          }
          .center {
            text-align: center;
            font-size: 11px;
            color: #78716c;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Sip &amp; Savor</h1>
          <p>Inventory Management System</p>
        </div>

        <div class="divider"></div>

        <div class="row">
          <span class="label">Invoice #:</span>
          <span class="value">${sale.invoice_number || sale.id.slice(0, 8).toUpperCase()}</span>
        </div>

        <div class="row">
          <span class="label">Date:</span>
          <span class="value">${new Date(sale.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}</span>
        </div>

        ${
          sale.customer_name
            ? `<div class="row"><span class="label">Customer:</span><span class="value">${sale.customer_name}</span></div>`
            : ''
        }

        <div class="divider"></div>

        ${itemRows || '<div class="row"><span>No items</span></div>'}

        <div class="divider"></div>

        <div class="row">
          <span class="label">Subtotal:</span>
          <span class="value">${currency(subtotal)}</span>
        </div>

        ${
          automaticDiscount > 0
            ? `<div class="row"><span class="label">Product Discount:</span><span class="value">-${currency(automaticDiscount)}</span></div>`
            : ''
        }

        ${
          invoiceDiscount > 0
            ? `<div class="row"><span class="label">Invoice Discount:</span><span class="value">-${currency(invoiceDiscount)}</span></div>`
            : ''
        }

        ${
          deliveryCharge > 0
            ? `<div class="row"><span class="label">Delivery:</span><span class="value">${currency(deliveryCharge)}</span></div>`
            : ''
        }

        <div class="row total">
          <span>TOTAL:</span>
          <span>${currency(grandTotal)}</span>
        </div>

        <div class="row">
          <span class="label">Payment:</span>
          <span class="value">${sale.payment_method || '�'}</span>
        </div>

        <div class="row">
          <span class="label">Status:</span>
          <span class="value">${sale.payment_status}</span>
        </div>

        ${
          sale.notes
            ? `<div class="divider"></div><div class="row"><span class="label">Notes:</span></div><div style="font-size: 11px; color: #57534e;">${sale.notes}</div>`
            : ''
        }

        <div class="divider"></div>

        <div class="center">
          Thank you for your purchase!
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=400,height=700');

    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  return (
    <Modal open onClose={onClose} title="Sales Receipt" maxWidth="max-w-sm">
      <div className="space-y-4">
        <div className="border-2 border-dashed border-stone-200 rounded-xl p-5 bg-stone-50">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 mb-2">
              <Receipt className="w-6 h-6 text-stone-900" />
            </div>
            <h3 className="font-bold text-stone-900">Sip &amp; Savor</h3>
            <p className="text-xs text-stone-400">Inventory Management System</p>
          </div>

          <div className="border-t border-dashed border-stone-300 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Invoice #:</span>
              <span className="font-medium text-stone-900">
                {sale.invoice_number || sale.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Date:</span>
              <span className="font-medium text-stone-900">
                {new Date(sale.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>

            {sale.customer_name && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Customer:</span>
                <span className="font-medium text-stone-900">
                  {sale.customer_name}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-stone-300 pt-3 mt-3 space-y-3">
            {items.length > 0 ? (
              items.map((item) => {
                const productName = item.products?.name || 'Unknown product';
                const variant = item.products?.variant
                  ? ` (${item.products.variant})`
                  : '';

                return (
                  <div key={item.id} className="border-b border-stone-200 pb-3 last:border-b-0 last:pb-0">
                    <p className="font-semibold text-stone-900">
                      {productName}{variant}
                    </p>

                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-stone-500">
                        {formatNumber(Number(item.quantity || 0))} � {formatCurrency(Number(item.unit_price || 0))}
                      </span>
                      <span className="font-medium text-stone-900">
                        {formatCurrency(Number(item.line_total || 0))}
                      </span>
                    </div>

                    {Number(item.discount || 0) > 0 && (
                      <div className="flex justify-between text-xs text-emerald-700 mt-1">
                        <span>Product Discount</span>
                        <span>-{formatCurrency(Number(item.discount || 0))}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-stone-400">No items recorded.</p>
            )}
          </div>

          <div className="border-t border-dashed border-stone-300 pt-3 mt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Subtotal:</span>
              <span className="font-medium text-stone-900">
                {formatCurrency(subtotal)}
              </span>
            </div>

            {automaticDiscount > 0 && (
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Product Discount:</span>
                <span>-{formatCurrency(automaticDiscount)}</span>
              </div>
            )}

            {invoiceDiscount > 0 && (
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Invoice Discount:</span>
                <span>-{formatCurrency(invoiceDiscount)}</span>
              </div>
            )}

            {deliveryCharge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Delivery:</span>
                <span className="font-medium text-stone-900">
                  {formatCurrency(deliveryCharge)}
                </span>
              </div>
            )}

            <div className="border-t border-stone-300 pt-2 flex justify-between text-base font-bold text-stone-900">
              <span>TOTAL:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Payment:</span>
              <span className="font-medium text-stone-900">
                {sale.payment_method || '�'}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Status:</span>
              <span className="font-medium text-stone-900">
                {sale.payment_status}
              </span>
            </div>

            {sale.notes && (
              <div className="mt-2 text-xs text-stone-500">
                <span className="font-medium">Notes:</span> {sale.notes}
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-stone-300 pt-3 mt-3 text-center">
            <p className="text-xs text-stone-400">
              Thank you for your purchase!
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button onClick={handlePrint} className="flex-1">
            <Printer className="w-4 h-4" /> Print Receipt
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RecordSaleModal({
  products,
  customers,
  onClose,
  onSaved,
}: {
  products: (Product & { current_stock: number })[];
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  type SaleLine = {
    id: string;
    productId: string;
    quantity: string;
    unitPrice: string;
  };

  const makeLine = (productId = products[0]?.id || ''): SaleLine => {
    const product = products.find((p) => p.id === productId);
    return {
      id: crypto.randomUUID(),
      productId,
      quantity: '',
      unitPrice: product ? String(product.selling_price ?? 0) : '',
    };
  };

  const [items, setItems] = useState<SaleLine[]>([makeLine()]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [initialPayment, setInitialPayment] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState('0');
  const [deliveryRequired, setDeliveryRequired] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState('Customer Pickup');
  const [customerCharge, setCustomerCharge] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCustomer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (selectedCustomer?.name) {
      setCustomerName(selectedCustomer.name);
    }
  }, [selectedCustomer]);

  const addItem = () => {
    setItems((current) => [...current, makeLine()]);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.length <= 1 ? current : current.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, patch: Partial<SaleLine>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.productId !== undefined) {
          const product = products.find((p) => p.id === patch.productId);
          next.unitPrice = product ? String(product.selling_price ?? 0) : '';
        }
        return next;
      })
    );
  };

  const getStandardPrice = (item: SaleLine) => {
    const product = products.find((p) => p.id === item.productId);
    return Number(product?.selling_price || 0);
  };

  const getLineDiscount = (item: SaleLine) => {
    const qty = Number(item.quantity) || 0;
    const actualPrice = Number(item.unitPrice) || 0;
    const standardPrice = getStandardPrice(item);
    return Math.max(0, standardPrice - actualPrice) * qty;
  };

  const getLineTotal = (item: SaleLine) => {
    const qty = Number(item.quantity) || 0;
    const actualPrice = Number(item.unitPrice) || 0;
    return Math.max(0, qty * actualPrice);
  };

  const subtotal = items.reduce((sum, item) => sum + getLineTotal(item), 0);
  const automaticDiscount = items.reduce((sum, item) => sum + getLineDiscount(item), 0);
  const invoiceDiscountAmount = Math.max(0, Number(invoiceDiscount) || 0);
  const discount = automaticDiscount + invoiceDiscountAmount;
  const deliveryCharge = deliveryRequired ? Math.max(0, Number(customerCharge) || 0) : 0;
  const grandTotal = Math.max(0, subtotal - invoiceDiscountAmount + deliveryCharge);

  const handleSave = async () => {
    setError('');

    const validItems = items.filter((item) => item.productId);
    if (validItems.length === 0) {
      setError('Add at least one product.');
      return;
    }

    for (const item of validItems) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      const lineDiscount = getLineDiscount(item);
      const product = products.find((p) => p.id === item.productId);

      if (!qty || qty <= 0) {
        setError('Every item must have a quantity greater than zero.');
        return;
      }
      if (price < 0) {
        setError('Unit price cannot be negative.');
        return;
      }
      if (lineDiscount < 0 || getLineTotal(item) < 0) {
        setError('Item discount is invalid.');
        return;
      }
      if (product && qty > Number(product.current_stock || 0)) {
        setError(`${product.name}: only ${product.current_stock} available in stock.`);
        return;
      }
    }

    if (discount > subtotal) {
      setError('Invoice discount cannot exceed the subtotal.');
      return;
    }

    const paymentAmount =
      paymentStatus === 'Paid'
        ? grandTotal
        : paymentStatus === 'Partially Paid'
        ? Number(initialPayment) || 0
        : 0;

    if (paymentAmount < 0 || paymentAmount > grandTotal) {
      setError('Initial payment cannot exceed the invoice total.');
      return;
    }

    if (paymentStatus === 'Credit' && !customerId) {
      setError('Select a customer for a credit sale.');
      return;
    }

    if (deliveryRequired && deliveryCharge < 0) {
      setError('Delivery charge cannot be negative.');
      return;
    }

    setSaving(true);

    try {
      const payload = validItems.map((item) => ({
        product_id: item.productId,
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
        discount: getLineDiscount(item),
      }));

      const { data, error: rpcError } = await supabase.rpc('create_multi_item_sale', {
        p_sale_date: new Date(`${date}T12:00:00`).toISOString(),
        p_customer_id: customerId || null,
        p_customer_name: customerName || null,
        p_items: payload,
        p_discount: invoiceDiscountAmount,
        p_delivery_charge: deliveryCharge,
        p_payment_method: paymentMethod,
        p_payment_status: paymentStatus,
        p_initial_payment: paymentAmount,
        p_due_date: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        p_delivery_required: deliveryRequired,
        p_notes: notes || null,
      });

      if (rpcError) throw rpcError;

      const sale = data as {
        sale_id: string;
        invoice_number: string;
        grand_total: number;
      };

      if (deliveryRequired) {
        const { error: deliveryError } = await supabase.from('deliveries').insert({
          delivery_number: `DEL-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          sale_id: sale.sale_id,
          customer_id: customerId || null,
          delivery_date: date,
          state: selectedCustomer?.state || null,
          lga: selectedCustomer?.lga || null,
          city: selectedCustomer?.city || null,
          delivery_address: selectedCustomer?.delivery_address || selectedCustomer?.address || null,
          landmark: selectedCustomer?.landmark || null,
          delivery_method: deliveryMethod,
          delivery_status: 'Pending',
          customer_delivery_charge: deliveryCharge,
          special_instructions: notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (deliveryError) throw deliveryError;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} title="Record Sale" onClose={onClose} maxWidth="max-w-6xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Sale Date"
            type="date"
            value={date}
            onChange={(value) => setDate(value)}
          />
          <Select
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            options={[
              { value: '', label: 'Walk-in Customer' },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Input
            label="Customer Name"
            value={customerName}
            onChange={(value) => setCustomerName(value)}
            placeholder="Optional"
          />
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
            <div>
              <h3 className="font-semibold text-gray-900">Invoice Items</h3>
              <p className="text-xs text-gray-500">Multiple products can be included on one invoice.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={addItem}><Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const product = products.find((p) => p.id === item.productId);
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2 min-w-[240px]">
                        <Select label="Product" value={item.productId}
                          onChange={(value) => updateItem(item.id, { productId: value })}
                          options={products.map((p) => ({
                            value: p.id,
                            label: `${p.name}${p.variant ? ` - ${p.variant}` : ''}`,
                          }))}
                        />
                        {product && (
                          <div className="text-xs text-gray-500 mt-1">
                            Stock: {product.current_stock}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 w-28">
                        <Input label="Quantity" type="number" min="0" step="0.01" value={item.quantity}
                          onChange={(value) => updateItem(item.id, { quantity: value })}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 w-36">
                        <Input label="Unit Price" type="number" min="0" step="0.01" value={item.unitPrice}
                          onChange={(value) => updateItem(item.id, { unitPrice: value })}
                        />
                      </td>
                      <td className="px-3 py-2 w-32">
                        <div className="text-right"><div className="text-xs text-gray-500 mb-1">Discount</div><div className="font-medium text-emerald-700">{formatCurrency(getLineDiscount(item))}</div></div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {formatCurrency(getLineTotal(item))}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={items.length <= 1}
                          className="p-2 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-30"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Invoice Discount"
            type="number"
            min="0"
            step="0.01"
            value={invoiceDiscount}
            onChange={(value) => setInvoiceDiscount(value)}
          />
          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={PAYMENT_METHODS}
          />
          <Select
            label="Payment Status"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={SALE_PAYMENT_STATUS}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Initial Payment"
            type="number"
            min="0"
            step="0.01"
            value={initialPayment}
            onChange={(value) => setInitialPayment(value)}
            placeholder={paymentStatus === 'Paid' ? String(grandTotal) : '0'}
          />
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(value) => setDueDate(value)}
          />
          <Input
            label="Notes"
            value={notes}
            onChange={(value) => setNotes(value)}
            placeholder="Optional"
          />
        </div>

        <div className="rounded-xl border border-gray-200 p-4 space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={deliveryRequired}
              onChange={(e) => setDeliveryRequired(e.target.checked)}
              className="rounded"
            />
            Delivery required
          </label>

          {deliveryRequired && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Delivery Method"
                value={deliveryMethod}
                onChange={setDeliveryMethod}
                options={DELIVERY_METHODS}
              />
              <Input
                label="Customer Delivery Charge"
                type="number"
                min="0"
                step="0.01"
                value={customerCharge}
                onChange={(value) => setCustomerCharge(value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <div className="w-full md:w-80 rounded-xl bg-gray-50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Discount</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Delivery</span>
              <span>{formatCurrency(deliveryCharge)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Grand Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Sale'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function DownloadSalesModal({ onClose }: { onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (format: 'csv' | 'excel') => {
    setDownloading(true);

    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        invoice_number,
        sale_date,
        grand_total,
        payment_status,
        legacy_payment_method,
        legacy_customer_name,
        customers(name),
        sale_items(
          quantity,
          unit_price,
          line_total,
          products(name, variant)
        )
      `)
      .order('sale_date', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Sales export error:', error);
      setDownloading(false);
      return;
    }

    const salesData = data || [];

    const headers = [
      'Date',
      'Invoice #',
      'Products',
      'Items',
      'Qty',
      'Customer',
      'Total',
      'Payment Method',
      'Payment Status',
    ];

    const rows = salesData.map((sale: any) => {
      const items = Array.isArray(sale.sale_items) ? sale.sale_items : [];

      const productNames = items
        .map((item: any) => {
          const product = item.products;
          return product
            ? `${product.name}${product.variant ? ` (${product.variant})` : ''} x ${Number(item.quantity || 0)}`
            : `Unknown Product x ${Number(item.quantity || 0)}`;
        })
        .join('; ');

      const totalQty = items.reduce(
        (sum: number, item: any) => sum + Number(item.quantity || 0),
        0
      );

      return [
        formatDate(sale.sale_date),
        sale.invoice_number || sale.id.slice(0, 8).toUpperCase(),
        productNames || '-',
        items.length,
        totalQty,
        sale.legacy_customer_name || sale.customers?.name || '-',
        Number(sale.grand_total || 0),
        sale.legacy_payment_method || '-',
        sale.payment_status || '-',
      ];
    });

    const filename = `Sales_Report_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      downloadCSV(filename, headers, rows);
    } else {
      downloadExcel(filename, 'Sales Report', headers, rows);
    }

    setDownloading(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Download Sales">
      <div className="space-y-4">
        <p className="text-sm text-stone-600">Download all sales records as a spreadsheet file.</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => handleDownload('csv')} disabled={downloading} className="flex-1">
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={() => handleDownload('excel')} disabled={downloading} className="flex-1">
            <Download className="w-4 h-4" /> Excel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditSaleModal({
  sale,
  products,
  customers,
  onClose,
  onSaved,
}: {
  sale: SaleWithProduct;
  products: (Product & { current_stock: number })[];
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  type EditLine = {
    id: string;
    productId: string;
    quantity: string;
    unitPrice: string;
  };

  const makeLineFromItem = (
    item: SaleWithProduct['sale_items'][number]
  ): EditLine => ({
    id: crypto.randomUUID(),
    productId: item.product_id,
    quantity: String(item.quantity ?? ''),
    unitPrice: String(item.unit_price ?? ''),
  });

  const initialDate = sale.sale_date
    ? new Date(sale.sale_date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const initialDueDate = sale.due_date
    ? new Date(sale.due_date).toISOString().split('T')[0]
    : '';

  const [items, setItems] = useState<EditLine[]>(
    sale.sale_items.length > 0
      ? sale.sale_items.map(makeLineFromItem)
      : [
          {
            id: crypto.randomUUID(),
            productId: products[0]?.id || '',
            quantity: '',
            unitPrice: products[0]
              ? String(products[0].selling_price ?? 0)
              : '',
          },
        ]
  );

  const [date, setDate] = useState(initialDate);
  const [customerId, setCustomerId] = useState(
    sale.customer_id || ''
  );
  const [customerName, setCustomerName] = useState(
    sale.legacy_customer_name ||
      sale.customers?.name ||
      ''
  );
  const [paymentMethod, setPaymentMethod] = useState(
    sale.legacy_payment_method || 'Cash'
  );
  const [paymentStatus, setPaymentStatus] = useState(
    sale.payment_status || 'Paid'
  );
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [invoiceDiscount, setInvoiceDiscount] = useState(
    String(Number(sale.discount || 0))
  );
  const [notes, setNotes] = useState(sale.notes || '');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCustomer = customers.find(
    (c) => c.id === customerId
  );

  useEffect(() => {
    if (selectedCustomer?.name) {
      setCustomerName(selectedCustomer.name);
    }
  }, [selectedCustomer]);

  const addItem = () => {
    const product = products[0];

    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: product?.id || '',
        quantity: '',
        unitPrice: product
          ? String(product.selling_price ?? 0)
          : '',
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((current) =>
      current.length <= 1
        ? current
        : current.filter((item) => item.id !== id)
    );
  };

  const updateItem = (
    id: string,
    patch: Partial<EditLine>
  ) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const next = { ...item, ...patch };

        if (patch.productId !== undefined) {
          const product = products.find(
            (p) => p.id === patch.productId
          );

          next.unitPrice = product
            ? String(product.selling_price ?? 0)
            : '';
        }

        return next;
      })
    );
  };

  const getStandardPrice = (item: EditLine) => {
    const product = products.find(
      (p) => p.id === item.productId
    );

    return Number(product?.selling_price || 0);
  };

  const getLineDiscount = (item: EditLine) => {
    const qty = Number(item.quantity) || 0;
    const actualPrice = Number(item.unitPrice) || 0;
    const standardPrice = getStandardPrice(item);

    return Math.max(
      0,
      standardPrice - actualPrice
    ) * qty;
  };

  const getLineTotal = (item: EditLine) => {
    const qty = Number(item.quantity) || 0;
    const actualPrice = Number(item.unitPrice) || 0;

    return Math.max(
      0,
      qty * actualPrice
    );
  };

  const subtotal = items.reduce(
    (sum, item) => sum + getLineTotal(item),
    0
  );

  const automaticDiscount = items.reduce(
    (sum, item) => sum + getLineDiscount(item),
    0
  );

  const invoiceDiscountAmount = Math.max(
    0,
    Number(invoiceDiscount) || 0
  );

  /*
   * Delivery editing is intentionally deferred.
   * We preserve the existing delivery charge and
   * delivery-required setting.
   */
  const deliveryCharge = Number(
    sale.delivery_charge || 0
  );

  const grandTotal = Math.max(
    0,
    subtotal -
      invoiceDiscountAmount +
      deliveryCharge
  );

  const handleSave = async () => {
    setError('');

    const validItems = items.filter(
      (item) => item.productId
    );

    if (validItems.length === 0) {
      setError('Add at least one product.');
      return;
    }

    if (!editReason.trim()) {
      setError('An edit reason is required.');
      return;
    }

    /*
     * The update RPC expects one consolidated row
     * per product.
     */
    const productIds = validItems.map(
      (item) => item.productId
    );

    if (
      new Set(productIds).size !== productIds.length
    ) {
      setError(
        'Each product can appear only once on an invoice. Combine duplicate quantities into one line.'
      );
      return;
    }

    for (const item of validItems) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);

      if (!qty || qty <= 0) {
        setError(
          'Every item must have a quantity greater than zero.'
        );
        return;
      }

      if (price < 0) {
        setError(
          'Unit price cannot be negative.'
        );
        return;
      }
    }

    if (invoiceDiscountAmount > subtotal) {
      setError(
        'Invoice discount cannot exceed the subtotal.'
      );
      return;
    }

    if (
      paymentStatus === 'Credit' &&
      !customerId
    ) {
      setError(
        'Select a customer for a credit sale.'
      );
      return;
    }

    setSaving(true);

    try {
      const payload = validItems.map((item) => ({
        product_id: item.productId,
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
        discount: getLineDiscount(item),
      }));

      const { error: rpcError } =
        await supabase.rpc(
          'update_multi_item_sale',
          {
            p_sale_id: sale.id,
            p_sale_date: new Date(
              `${date}T12:00:00`
            ).toISOString(),
            p_customer_id:
              customerId || null,
            p_customer_name:
              customerName || null,
            p_items: payload,
            p_discount:
              invoiceDiscountAmount,
            p_delivery_charge:
              deliveryCharge,
            p_payment_method:
              paymentMethod,
            p_payment_status:
              paymentStatus,
            p_due_date: dueDate
              ? new Date(
                  `${dueDate}T23:59:59`
                ).toISOString()
              : null,
            p_delivery_required:
              sale.delivery_required,
            p_notes: notes || null,
            p_edit_reason:
              editReason.trim(),
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update invoice.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      title={`Edit Invoice ${sale.invoice_number}`}
      onClose={onClose}
      maxWidth="max-w-6xl"
    >
      <div className="space-y-5">

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Editing this invoice will reverse the
            original stock movements and create new
            stock movements.
          </p>

          <p className="text-xs text-amber-800 mt-1">
            The invoice number remains unchanged.
            An edit reason is required for the audit trail.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <Input
            label="Sale Date"
            type="date"
            value={date}
            onChange={setDate}
          />

          <Select
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            options={[
              {
                value: '',
                label: 'Walk-in Customer',
              },
              ...customers.map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />

          <Input
            label="Customer Name"
            value={customerName}
            onChange={setCustomerName}
            placeholder="Optional"
          />

        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden">

          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">

            <div>
              <h3 className="font-semibold text-gray-900">
                Invoice Items
              </h3>

              <p className="text-xs text-gray-500">
                Modify products, quantities, and selling prices.
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={addItem}
            >
              <Plus className="w-4 h-4" />
              Add Item
            </Button>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">
                    Product
                  </th>
                  <th className="px-3 py-2 text-right">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right">
                    Unit Price
                  </th>
                  <th className="px-3 py-2 text-right">
                    Discount
                  </th>
                  <th className="px-3 py-2 text-right">
                    Line Total
                  </th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>

              <tbody className="divide-y">

                {items.map((item) => {
                  const product =
                    products.find(
                      (p) =>
                        p.id === item.productId
                    );

                  return (
                    <tr key={item.id}>

                      <td className="px-3 py-2 min-w-[240px]">
                        <Select
                          label="Product"
                          value={item.productId}
                          onChange={(value) =>
                            updateItem(
                              item.id,
                              {
                                productId: value,
                              }
                            )
                          }
                          options={products.map(
                            (p) => ({
                              value: p.id,
                              label: `${p.name}${
                                p.variant
                                  ? ` - ${p.variant}`
                                  : ''
                              }`,
                            })
                          )}
                        />

                        {product && (
                          <div className="text-xs text-gray-500 mt-1">
                            Current stock:{' '}
                            {product.current_stock}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 w-28">
                        <Input
                          label="Quantity"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(value) =>
                            updateItem(
                              item.id,
                              {
                                quantity: value,
                              }
                            )
                          }
                        />
                      </td>

                      <td className="px-3 py-2 w-36">
                        <Input
                          label="Unit Price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(value) =>
                            updateItem(
                              item.id,
                              {
                                unitPrice: value,
                              }
                            )
                          }
                        />
                      </td>

                      <td className="px-3 py-2 w-32">
                        <div className="text-right">

                          <div className="text-xs text-gray-500 mb-1">
                            Discount
                          </div>

                          <div className="font-medium text-emerald-700">
                            {formatCurrency(
                              getLineDiscount(item)
                            )}
                          </div>

                        </div>
                      </td>

                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {formatCurrency(
                          getLineTotal(item)
                        )}
                      </td>

                      <td className="px-3 py-2">

                        <button
                          type="button"
                          onClick={() =>
                            removeItem(item.id)
                          }
                          disabled={items.length <= 1}
                          className="p-2 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-30"
                        >
                          <Trash2 size={16} />
                        </button>

                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <Input
            label="Invoice Discount"
            type="number"
            min="0"
            step="0.01"
            value={invoiceDiscount}
            onChange={setInvoiceDiscount}
          />

          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={PAYMENT_METHODS}
          />

          <Select
            label="Payment Status"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={SALE_PAYMENT_STATUS}
          />

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={setDueDate}
          />

          <Input
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Optional"
          />

        </div>

        <div className="rounded-xl border border-gray-200 p-4">

          <Input
            label="Edit Reason *"
            value={editReason}
            onChange={setEditReason}
            placeholder="e.g. Customer requested quantity correction"
          />

          <p className="text-xs text-gray-500 mt-2">
            This reason is saved with the invoice edit audit trail.
          </p>

        </div>

        <div className="flex justify-end">

          <div className="w-full md:w-80 rounded-xl bg-gray-50 p-4 space-y-2">

            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Automatic Item Discount</span>
              <span>
                -{formatCurrency(automaticDiscount)}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Invoice Discount</span>
              <span>
                -{formatCurrency(invoiceDiscountAmount)}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Delivery</span>
              <span>
                {formatCurrency(deliveryCharge)}
              </span>
            </div>

            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Grand Total</span>
              <span>
                {formatCurrency(grandTotal)}
              </span>
            </div>

          </div>

        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">

          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : 'Save Invoice Changes'}
          </Button>

        </div>

      </div>
    </Modal>
  );
}














































