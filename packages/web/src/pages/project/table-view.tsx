/**
 * Project Table View — spreadsheet-like view of all nodes in the active environment
 *
 * Reads from the active card in Redux (set by environment tab bar).
 */

import { selectActiveCard } from '@ui/store/slices/cards-slice';
import { ArrowUpDown } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

interface NodeRow {
  id: string;
  type: string;
  label: string;
  iceType: string;
  provider: string;
  status: string;
}

export const ProjectTableView: React.FC<{ projectId: string }> = () => {
  const activeCard = useSelector(selectActiveCard);
  const [sortCol, setSortCol] = useState<'label' | 'iceType' | 'provider'>('label');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const rows: NodeRow[] = useMemo(() => {
    if (!activeCard) return [];
    return (activeCard.nodes || [])
      .filter((n: any) => n.type === 'resource')
      .map((n: any) => ({
        id: n.id,
        type: n.type || 'resource',
        label: (n.data?.label as string) || n.id,
        iceType: (n.data?.iceType as string) || '',
        provider: (n.data?.provider as string) || '',
        status: (n.data?.status as string) || '',
      }));
  }, [activeCard]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortCol] || '';
      const vb = b[sortCol] || '';
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [rows, sortCol, sortDir]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-xl font-semibold text-ice-text-1 mb-6">
        Resources {activeCard && <span className="text-ice-text-3 text-sm font-normal ml-2">({rows.length})</span>}
      </h1>

      {rows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-ice-text-3 text-sm">No resources in this environment</p>
        </div>
      ) : (
        <div className="border border-ice-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-ice-raised text-ice-text-3 text-xs uppercase tracking-wider">
                <th
                  className="px-4 py-2 text-left cursor-pointer hover:text-ice-text-2"
                  onClick={() => toggleSort('label')}
                >
                  <span className="flex items-center gap-1">
                    Name <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th
                  className="px-4 py-2 text-left cursor-pointer hover:text-ice-text-2"
                  onClick={() => toggleSort('iceType')}
                >
                  <span className="flex items-center gap-1">
                    Type <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th
                  className="px-4 py-2 text-left cursor-pointer hover:text-ice-text-2"
                  onClick={() => toggleSort('provider')}
                >
                  <span className="flex items-center gap-1">
                    Provider <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ice-border">
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-ice-hover transition-colors">
                  <td className="px-4 py-2.5 text-sm text-ice-text-1 font-medium">{r.label}</td>
                  <td className="px-4 py-2.5 text-xs text-ice-text-2 font-mono">{r.iceType}</td>
                  <td className="px-4 py-2.5 text-xs text-ice-text-2 uppercase">{r.provider}</td>
                  <td className="px-4 py-2.5">
                    {r.status && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          r.status === 'active' || r.status === 'running'
                            ? 'text-emerald-500'
                            : r.status === 'failed' || r.status === 'error'
                              ? 'text-red-500'
                              : 'text-ice-text-3'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {r.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
