import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const tables = [
  'raw_materials',
  'raw_material_transactions',
  'products',
  'recipe_items',
  'finished_goods_transactions',
  'sales',
  'customers',
  'customer_payments',
  'payment_allocations',
  'transporters',
  'delivery_zones',
  'delivery_rates',
  'deliveries',
  'expenses',
];

const PAGE_SIZE = 500;

export default function DatabaseExport() {
  const [status, setStatus] = useState('Ready');
  const [exporting, setExporting] = useState(false);

  const exportDatabase = async () => {
    setExporting(true);
    setStatus('Starting export...');

    try {
      const database: Record<string, unknown[]> = {};

      for (const table of tables) {
        setStatus(`Exporting ${table}...`);

        const allRows: unknown[] = [];
        let offset = 0;

        while (true) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) {
            throw new Error(`${table}: ${error.message}`);
          }

          const rows = data || [];
          allRows.push(...rows);

          if (rows.length < PAGE_SIZE) {
            break;
          }

          offset += PAGE_SIZE;
        }

        database[table] = allRows;
        setStatus(`${table}: ${allRows.length} rows`);
      }

      const blob = new Blob(
        [JSON.stringify(database, null, 2)],
        { type: 'application/json' }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sip_savor_full_database.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStatus('EXPORT COMPLETE — check your Downloads folder.');
    } catch (error) {
      console.error(error);
      setStatus(
        `EXPORT FAILED: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">
        Sip 'n' Savor Database Export
      </h1>

      <p className="mb-6 text-stone-600">
        This exports the database tables using your authenticated session.
      </p>

      <button
        onClick={exportDatabase}
        disabled={exporting}
        className="px-6 py-3 bg-amber-600 text-white rounded-lg disabled:opacity-50"
      >
        {exporting ? 'Exporting...' : 'Export Full Database'}
      </button>

      <p className="mt-6 font-medium">
        Status: {status}
      </p>
    </div>
  );
}
