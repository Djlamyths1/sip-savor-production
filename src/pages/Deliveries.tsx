import { useEffect, useState, useCallback } from 'react';
import {
  Truck,
  Plus,
  Search,
  Printer,
  Download,
  MapPin,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Coins,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/context/PermissionContext';
import {
  type Delivery,
  type Customer,
  type Transporter,
  type DeliveryZone,
  type LogisticsSummary,
  type Sale,
} from '@/lib/types';
import {
  DELIVERY_METHODS,
  DELIVERY_STATUSES,
  DELIVERY_REQUIREMENTS,
  NIGERIAN_STATES,
} from '@/lib/constants';
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
import { formatCurrency, formatDate, getDateRange, downloadCSV, classNames, type PeriodPreset } from '@/lib/utils';

interface DeliveryWithRelations extends Delivery {
  customers: { name: string; phone: string | null; state: string | null; city: string | null; lga: string | null; delivery_address: string | null; landmark: string | null } | null;
  transporters: { name: string; phone: string | null } | null;
  sales: { invoice_number: string | null; grand_total: number } | null;
}

const STATUS_COLORS: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'stone'> = {
  'Pending': 'stone',
  'Preparing': 'amber',
  'Ready for Dispatch': 'amber',
  'Dispatched': 'blue',
  'In Transit': 'blue',
  'Arrived at Destination': 'blue',
  'Delivered': 'green',
  'Failed Delivery': 'red',
  'Returned': 'red',
  'Cancelled': 'stone',
};

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState<DeliveryWithRelations[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterState, setFilterState] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<DeliveryWithRelations | null>(null);
  const [summary, setSummary] = useState<LogisticsSummary>({ pending_count: 0, ready_count: 0, in_transit_count: 0, delivered_count: 0, failed_count: 0, returned_count: 0, total_delivery_cost: 0, total_customer_charges: 0, total_delivery_margin: 0 });

  const { canEnter, canView, canManage } = usePermissions();
  const canCreateDeliveries = canEnter('deliveries.create');
  const canViewDeliveries = canView('deliveries.view');
  const canEditDeliveries = canManage('deliveries.edit');
  const canUpdateDeliveryStatus = canManage('deliveries.update_status');
  const canViewDeliveryCost = canView('deliveries.view_cost');
  const canViewDeliveryMargin = canView('deliveries.view_margin');

  const load = useCallback(async () => {
    if (!canViewDeliveries) {
      setDeliveries([]);
      setLoading(false);
      return;
    }

    const [delRes, custRes, transRes, zoneRes] = await Promise.all([
      supabase.rpc('get_deliveries_history', {
        p_limit: 200,
      }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('transporters').select('*').order('name'),
      supabase.from('delivery_zones').select('*').order('name'),
    ]);

    setDeliveries((delRes.data || []) as DeliveryWithRelations[]);
    setCustomers((custRes.data || []) as Customer[]);
    setTransporters((transRes.data || []) as Transporter[]);
    setZones((zoneRes.data || []) as DeliveryZone[]);

    const { data: sumData } = await supabase.rpc('get_logistics_summary');
    setSummary((sumData as LogisticsSummary) || { pending_count: 0, ready_count: 0, in_transit_count: 0, delivered_count: 0, failed_count: 0, returned_count: 0, total_delivery_cost: 0, total_customer_charges: 0, total_delivery_margin: 0 });
    setLoading(false);
  }, [canViewDeliveries]);

  useEffect(() => { load(); }, [load]);

  const filtered = deliveries.filter((d) => {
    if (filterStatus && d.delivery_status !== filterStatus) return false;
    if (filterMethod && d.delivery_method !== filterMethod) return false;
    if (filterState && d.state !== filterState) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        d.delivery_number?.toLowerCase().includes(s) ||
        d.customers?.name?.toLowerCase().includes(s) ||
        d.tracking_number?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc('update_delivery_status', {
      p_delivery_id: id,
      p_status: status,
    });

    if (error) {
      window.alert(error.message);
      return;
    }

    await load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Track interstate deliveries, logistics costs, and delivery margins"
        action={canCreateDeliveries ? <Button onClick={() => setShowCreate(true)} disabled={customers.length === 0}><Plus className="w-4 h-4" /> New Delivery</Button> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending" value={String(summary.pending_count)} icon={Clock} accent="amber" />
        <StatCard label="In Transit" value={String(summary.in_transit_count)} icon={Truck} accent="blue" />
        <StatCard label="Delivered" value={String(summary.delivered_count)} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Failed/Returned" value={String(summary.failed_count + summary.returned_count)} icon={XCircle} accent="red" />
        {canViewDeliveryCost && <StatCard label="Delivery Cost" value={formatCurrency(summary.total_delivery_cost)} icon={Coins} accent="red" subtitle="Actual cost" />}
        {canViewDeliveryMargin && <StatCard label="Customer Charges" value={formatCurrency(summary.total_customer_charges)} icon={TrendingUp} accent="emerald" subtitle="Charged to customers" />}
        {canViewDeliveryMargin && <StatCard label="Delivery Margin" value={formatCurrency(summary.total_delivery_margin)} icon={TrendingUp} accent={summary.total_delivery_margin >= 0 ? 'emerald' : 'red'} subtitle="Charges - Cost" />}
        <StatCard label="Ready for Dispatch" value={String(summary.ready_count)} icon={Package} accent="amber" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search delivery #, customer, tracking..." className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white">
          <option value="">All Statuses</option>
          {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white">
          <option value="">All Methods</option>
          {DELIVERY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white">
          <option value="">All States</option>
          {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={Truck} title="No deliveries yet" message="Create your first delivery to start tracking interstate logistics." action={canCreateDeliveries && customers.length > 0 ? <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> New Delivery</Button> : undefined} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Delivery #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">State</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Method</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Transporter</th>
                  {canViewDeliveryCost && <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Cost</th>}
                  {canViewDeliveryMargin && <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Charge</th>}
                  {canViewDeliveryMargin && <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Margin</th>}
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Status</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-sm font-mono text-stone-700">{d.delivery_number}</td>
                    <td className="px-5 py-3 text-sm font-medium text-stone-900">{d.customers?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-stone-600"><span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-stone-400" />{d.state || '—'}</span></td>
                    <td className="px-5 py-3 text-sm text-stone-600">{d.delivery_method}</td>
                    <td className="px-5 py-3 text-sm text-stone-600">{d.transporters?.name || '—'}</td>
                    {canViewDeliveryCost && <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(d.delivery_cost)}</td>}
                    {canViewDeliveryMargin && <td className="px-5 py-3 text-right text-sm font-medium text-stone-900">{formatCurrency(d.customer_delivery_charge)}</td>}
                    {canViewDeliveryMargin && <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: d.delivery_margin >= 0 ? '#059669' : '#dc2626' }}>{formatCurrency(d.delivery_margin)}</td>}
                    <td className="px-5 py-3"><Badge color={STATUS_COLORS[d.delivery_status] || 'stone'}>{d.delivery_status}</Badge></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => printDeliveryNote(d, canViewDeliveryCost, canViewDeliveryMargin)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors" title="Print delivery note"><Printer className="w-4 h-4" /></button>
                        {canEditDeliveries && <button onClick={() => setEditingDelivery(d)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showCreate && (
        <DeliveryModal customers={customers} transporters={transporters} zones={zones} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editingDelivery && (
        <DeliveryModal delivery={editingDelivery} customers={customers} transporters={transporters} zones={zones} onClose={() => setEditingDelivery(null)} onSaved={() => { setEditingDelivery(null); load(); }} />
      )}
    </div>
  );
}

function DeliveryModal({ delivery, customers, transporters, zones, onClose, onSaved }: {
  delivery?: DeliveryWithRelations;
  customers: Customer[];
  transporters: Transporter[];
  zones: DeliveryZone[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState(delivery?.customer_id || customers[0]?.id || '');
  const [deliveryDate, setDeliveryDate] = useState(delivery?.delivery_date || new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState(delivery?.expected_delivery_date || '');
  const [deliveryMethod, setDeliveryMethod] = useState(delivery?.delivery_method || 'Customer Pickup');
  const [transporterId, setTransporterId] = useState(delivery?.transporter_id || '');
  const [trackingNumber, setTrackingNumber] = useState(delivery?.tracking_number || '');
  const [deliveryStatus, setDeliveryStatus] = useState(delivery?.delivery_status || 'Pending');
  const [deliveryCost, setDeliveryCost] = useState(delivery ? String(delivery.delivery_cost) : '');
  const [customerCharge, setCustomerCharge] = useState(delivery ? String(delivery.customer_delivery_charge) : '');
  const [specialInstructions, setSpecialInstructions] = useState(delivery?.special_instructions || '');
  const [deliveryRequirements, setDeliveryRequirements] = useState(delivery?.delivery_requirements || '');
  const [saleId, setSaleId] = useState(delivery?.sale_id || '');
  const [availableSales, setAvailableSales] = useState<{ id: string; invoice_number: string | null; grand_total: number }[]>([]);
  const [estimatedRate, setEstimatedRate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCustomer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (!customerId) return;
    supabase.from('sales')
      .select('id, invoice_number, grand_total')
      .eq('customer_id', customerId)
      .order('sale_date', { ascending: false })
      .limit(20)
      .then(({ data }) => setAvailableSales(data || []));
  }, [customerId]);

  useEffect(() => {
    if (!selectedCustomer || !deliveryMethod) return;
    supabase.rpc('get_delivery_rate', {
      p_state: selectedCustomer.state || null,
      p_lga: selectedCustomer.lga || null,
      p_zone_id: selectedCustomer.delivery_zone_id || null,
      p_delivery_method: deliveryMethod,
    }).then(({ data }) => {
      if (data && (data as { rate: number }[]).length > 0) {
        const rate = (data as { rate: number }[])[0].rate;
        setEstimatedRate(rate);
        if (!customerCharge) setCustomerCharge(String(rate));
      } else {
        setEstimatedRate(null);
      }
    });
  }, [selectedCustomer, deliveryMethod]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (!customerId) { setError('Select a customer'); setSaving(false); return; }
      const payload = {
        customer_id: customerId,
        sale_id: saleId || null,
        delivery_date: deliveryDate,
        expected_delivery_date: expectedDate || null,
        state: selectedCustomer?.state || null,
        lga: selectedCustomer?.lga || null,
        city: selectedCustomer?.city || null,
        delivery_address: selectedCustomer?.delivery_address || null,
        landmark: selectedCustomer?.landmark || null,
        delivery_method: deliveryMethod,
        transporter_id: transporterId || null,
        tracking_number: trackingNumber || null,
        delivery_status: deliveryStatus,
        delivery_cost: parseFloat(deliveryCost) || 0,
        customer_delivery_charge: parseFloat(customerCharge) || 0,
        special_instructions: specialInstructions || null,
        delivery_requirements: deliveryRequirements || null,
      };

      const { error: e } = await supabase.rpc('save_delivery', {
        p_delivery_id: delivery?.id || null,
        p_customer_id: customerId,
        p_sale_id: saleId || null,
        p_delivery_date: deliveryDate || null,
        p_expected_delivery_date: expectedDate || null,
        p_state: selectedCustomer?.state || null,
        p_lga: selectedCustomer?.lga || null,
        p_city: selectedCustomer?.city || null,
        p_delivery_address: selectedCustomer?.delivery_address || null,
        p_landmark: selectedCustomer?.landmark || null,
        p_delivery_method: deliveryMethod,
        p_transporter_id: transporterId || null,
        p_tracking_number: trackingNumber || null,
        p_delivery_status: deliveryStatus,
        p_delivery_cost: parseFloat(deliveryCost) || 0,
        p_customer_delivery_charge: parseFloat(customerCharge) || 0,
        p_special_instructions: specialInstructions || null,
        p_delivery_requirements: deliveryRequirements || null,
      });

      if (e) throw e;

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save delivery');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={delivery ? 'Edit Delivery' : 'New Delivery'} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white">
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? ` — ${c.state}` : ''}</option>)}
          </select>
        </div>
        {selectedCustomer && (
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
            <div className="flex items-center gap-2 mb-1"><MapPin className="w-4 h-4" /> {selectedCustomer.city || '—'}, {selectedCustomer.state || '—'}</div>
            {selectedCustomer.delivery_address && <p className="text-xs text-blue-600">{selectedCustomer.delivery_address}</p>}
            {selectedCustomer.landmark && <p className="text-xs text-blue-600">Landmark: {selectedCustomer.landmark}</p>}
          </div>
        )}
        {availableSales.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Link to Invoice (optional)</label>
            <select value={saleId} onChange={(e) => setSaleId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white">
              <option value="">No linked invoice</option>
              {availableSales.map((s) => <option key={s.id} value={s.id}>{s.invoice_number || s.id.slice(0, 8).toUpperCase()} — {formatCurrency(s.grand_total)}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Delivery Date" type="date" value={deliveryDate} onChange={setDeliveryDate} />
          <Input label="Expected Delivery" type="date" value={expectedDate} onChange={setExpectedDate} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Delivery Method" value={deliveryMethod} onChange={setDeliveryMethod} options={DELIVERY_METHODS as unknown as string[]} />
          <Select label="Delivery Status" value={deliveryStatus} onChange={setDeliveryStatus} options={DELIVERY_STATUSES as unknown as string[]} />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Transporter (optional)</label>
          <select value={transporterId} onChange={(e) => setTransporterId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white">
            <option value="">No transporter</option>
            {transporters.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}{t.company ? ` — ${t.company}` : ''}</option>)}
          </select>
        </div>
        <Input label="Tracking Number" value={trackingNumber} onChange={setTrackingNumber} placeholder="Tracking number" />
        {estimatedRate !== null && (
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-sm text-amber-800">Estimated delivery rate: <span className="font-bold">{formatCurrency(estimatedRate)}</span></p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Actual Delivery Cost (NGN)" type="number" value={deliveryCost} onChange={setDeliveryCost} step="0.01" min="0" placeholder="0" />
          <Input label="Customer Delivery Charge (NGN)" type="number" value={customerCharge} onChange={setCustomerCharge} step="0.01" min="0" placeholder="0" />
        </div>
        {parseFloat(deliveryCost) > 0 && parseFloat(customerCharge) > 0 && (
          <div className="bg-stone-50 rounded-lg p-3">
            <p className="text-sm text-stone-700">Delivery Margin: <span className="font-bold" style={{ color: parseFloat(customerCharge) - parseFloat(deliveryCost) >= 0 ? '#059669' : '#dc2626' }}>{formatCurrency(parseFloat(customerCharge) - parseFloat(deliveryCost))}</span></p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Delivery Requirements</label>
          <div className="flex flex-wrap gap-2">
            {DELIVERY_REQUIREMENTS.map((r) => (
              <button key={r} onClick={() => setDeliveryRequirements(prev => prev ? `${prev}, ${r}` : r)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 text-stone-600 hover:bg-stone-50 transition-all">{r}</button>
            ))}
          </div>
          {deliveryRequirements && <p className="text-xs text-stone-500 mt-2">Selected: {deliveryRequirements}</p>}
        </div>
        <Input label="Special Instructions" value={specialInstructions} onChange={setSpecialInstructions} placeholder="Delivery instructions" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !customerId}>{saving ? 'Saving...' : 'Save Delivery'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function printDeliveryNote(d: DeliveryWithRelations, canViewDeliveryCost: boolean, canViewDeliveryMargin: boolean) {
  const html = `<!DOCTYPE html><html><head><title>Delivery Note - ${d.delivery_number}</title><style>
  *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px;color:#1c1917}
  .header{text-align:center;margin-bottom:24px}.header h1{font-size:22px;font-weight:bold}
  .header p{font-size:12px;color:#78716c;margin-top:2px}
  .section{margin-bottom:20px}.section h3{font-size:14px;font-weight:bold;margin-bottom:8px;border-bottom:1px solid #e7e5e4;padding-bottom:4px}
  .row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
  .label{color:#57534e}.value{font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#f5f5f0;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e7e5e4}
  td{padding:8px;border-bottom:1px solid #f5f5f4;font-size:12px}
  @media print{body{padding:15px}}
  </style></head><body>
  <div class="header"><h1>Sip &amp; Savor</h1><p>Beverage Production &amp; Sales</p></div>
  <div class="section">
    <h3>Delivery Note</h3>
    <div class="row"><span class="label">Delivery #:</span><span class="value">${d.delivery_number}</span></div>
    <div class="row"><span class="label">Invoice #:</span><span class="value">${d.sales?.invoice_number || '—'}</span></div>
    <div class="row"><span class="label">Date:</span><span class="value">${formatDate(d.delivery_date)}</span></div>
    ${d.expected_delivery_date ? `<div class="row"><span class="label">Expected Delivery:</span><span class="value">${formatDate(d.expected_delivery_date)}</span></div>` : ''}
  </div>
  <div class="section">
    <h3>Customer</h3>
    <div class="row"><span class="label">Name:</span><span class="value">${d.customers?.name || '—'}</span></div>
    <div class="row"><span class="label">Phone:</span><span class="value">${d.customers?.phone || '—'}</span></div>
    <div class="row"><span class="label">Address:</span><span class="value">${d.delivery_address || d.customers?.delivery_address || '—'}</span></div>
    <div class="row"><span class="label">State:</span><span class="value">${d.state || '—'}</span></div>
    <div class="row"><span class="label">LGA:</span><span class="value">${d.lga || '—'}</span></div>
    <div class="row"><span class="label">City:</span><span class="value">${d.city || '—'}</span></div>
    ${d.landmark ? `<div class="row"><span class="label">Landmark:</span><span class="value">${d.landmark}</span></div>` : ''}
  </div>
  <div class="section">
    <h3>Delivery Details</h3>
    <div class="row"><span class="label">Method:</span><span class="value">${d.delivery_method}</span></div>
    <div class="row"><span class="label">Transporter:</span><span class="value">${d.transporters?.name || '—'}</span></div>
    <div class="row"><span class="label">Tracking #:</span><span class="value">${d.tracking_number || '—'}</span></div>
    <div class="row"><span class="label">Status:</span><span class="value">${d.delivery_status}</span></div>
    ${d.delivery_requirements ? `<div class="row"><span class="label">Requirements:</span><span class="value">${d.delivery_requirements}</span></div>` : ''}
  </div>
  ${d.special_instructions ? `<div class="section"><h3>Special Instructions</h3><p style="font-size:13px;">${d.special_instructions}</p></div>` : ''}
  <div class="section">
    <h3>Charges</h3>
      ${canViewDeliveryMargin ? `<div class="row"><span class="label">Customer Delivery Charge:</span><span class="value">${formatCurrency(d.customer_delivery_charge)}</span></div>` : ''}
      ${canViewDeliveryCost ? `<div class="row"><span class="label">Actual Delivery Cost:</span><span class="value">${formatCurrency(d.delivery_cost)}</span></div>` : ''}
  </div>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
}









