/**
 * Properties Panel — Right Sidebar
 *
 * Properties are fetched from the core database (HIGH_LEVEL_CATEGORIES)
 * via window.api.resources IPC channel — not hardcoded.
 *
 * Shows:
 * 1. Nothing selected → Project overview (node count, cost estimate, card name)
 * 2. Node selected → Editable property fields from DB + scaling controls
 * 3. Edge selected → Relationship, protocol, port fields
 */

import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { useSelector, useDispatch } from 'react-redux';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../assets/icons';
import { useTranslation, t } from '../../../i18n';
import { getBrandIcon } from '../../../assets/icons/brand-registry';
import { GROUP_COLOR_PRESETS } from '../../../config/color-palette';
import { getApi } from '../../../shared/api/api-adapter';
import axiosInstance from '../../../shared/api/axios-instance';
import { cn } from '../../../shared/utils/cn';
import {
  selectActiveCard,
  updateCardNodeData,
  updateCardEdgeData,
  deleteCardEdge,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import { setDriftCheckLoading, setDriftResults } from '../../../store/slices/deploy-slice';
import { fetchGitHubBranches } from '../../../store/slices/integrations-slice';
import {
  fetchRulesForNode,
  fetchEventsForNode,
  createPipelineRule,
  updatePipelineRule,
  deletePipelineRule,
  type DeploymentRule,
  type DeploymentEvent,
  type DeployStep,
} from '../../../store/slices/pipeline-slice';
import { toggleProperties } from '../../../store/slices/ui-slice';
import { analyzeCanvasPatterns } from '../../canvas/utils/connection-rules';
import { RepoSelector } from '../../integrations/components/repo-selector';
import type { RootState, AppDispatch } from '../../../store';

// ─── Types from core HIGH_LEVEL_CATEGORIES ──────────────────────────────────

interface OptionDetail {
  value: string;
  label: string;
  description?: string;
  cost?: string;
  provider?: string;
}

interface HighLevelProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'list';
  required: boolean;
  description: string;
  options?: string[];
  default?: unknown;
  tier?: 'essential' | 'detailed' | 'advanced';
  placeholder?: string;
  addLabel?: string;
  optionDetails?: OptionDetail[];
}

interface ProviderImpl {
  provider: string;
  resource_type: string;
  display_name: string;
}

interface ResourceDef {
  ice_type: string;
  display_name: string;
  description: string;
  category: string;
  icon: string;
  behavior: string;
  providers: string[];
  implementations: ProviderImpl[];
  properties: HighLevelProperty[];
}

interface ResourceCategory {
  category: string;
  categoryId: string;
  resources: ResourceDef[];
}

// ─── Cost parsing utility ──────────────────────────────────────────────────

function parseCostRange(cost: string): number {
  const matches = cost.match(/\$(\d+)(?:[–-](\d+))?/);
  if (!matches) return 0;
  const low = parseInt(matches[1]);
  const high = matches[2] ? parseInt(matches[2]) : low;
  return (low + high) / 2;
}

function formatCost(value: number): string {
  if (value === 0) return '';
  return `~$${Math.round(value)}/mo`;
}

// ─── UI components ─────────────────────────────────────────────────────────

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="w-5 h-5 flex items-center justify-center rounded hover:bg-ice-hover text-ice-text-3 hover:text-ice-text-1 transition-colors"
    title={t('properties.closeTitle')}
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  </button>
);

// ─── Group Color Picker ─────────────────────────────────────────────────────

const GROUP_COLORS = GROUP_COLOR_PRESETS;

const GroupColorPicker: React.FC<{
  color: string;
  onChange: (color: string) => void;
}> = ({ color, onChange }) => (
  <div className="px-3 py-2 border-b border-ice-border">
    <div className="text-ice-2xs text-ice-text-3 mb-1.5">{t('properties.groupColor')}</div>
    <div className="flex items-center gap-1.5 flex-wrap">
      {GROUP_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: c === color ? 'white' : 'transparent',
            boxShadow: c === color ? `0 0 0 2px ${c}` : undefined,
          }}
          title={c}
        />
      ))}
    </div>
  </div>
);

// ─── Drift Indicator ────────────────────────────────────────────────────────

const DriftIndicator: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const driftInfo = useSelector((s: RootState) => s.deploy.driftByNode[nodeId]);
  const isLoading = useSelector((s: RootState) => s.deploy.driftCheckLoading);

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-ice-xs text-ice-text-3 flex items-center gap-1.5">
        <div className="w-3 h-3 border border-ice-text-3 border-t-transparent rounded-full animate-spin" />
        {t('properties.drift.checking')}
      </div>
    );
  }

  if (!driftInfo) return null;

  if (driftInfo.status === 'in_sync') {
    return (
      <div className="px-3 py-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-ice-xs text-emerald-500 font-medium">{t('properties.drift.inSync')}</span>
      </div>
    );
  }

  if (driftInfo.status === 'missing') {
    return (
      <div className="px-3 py-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span className="text-ice-xs text-amber-500 font-medium">{t('properties.drift.notInDeployment')}</span>
      </div>
    );
  }

  if (driftInfo.status === 'drifted' && driftInfo.changes.length > 0) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-ice-xs text-orange-500 font-medium">
            {t('properties.drift.drifted')} ({driftInfo.changes.length} {driftInfo.changes.length === 1 ? t('properties.drift.change') : t('properties.drift.changes')})
          </span>
        </div>
        <div className="space-y-1.5 ml-3">
          {driftInfo.changes.map((change, i) => (
            <div key={i} className="text-ice-2xs">
              <span className="text-ice-text-3">{change.path}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-red-400 line-through">{String(change.actual)}</span>
                <span className="text-ice-text-3">&rarr;</span>
                <span className="text-emerald-400">{String(change.desired)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

const DriftCheckButton: React.FC<{ cardId: string; nodes: any[] }> = ({ cardId, nodes }) => {
  const dispatch = useDispatch<AppDispatch>();
  const isLoading = useSelector((s: RootState) => s.deploy.driftCheckLoading);

  const handleCheckDrift = async () => {
    dispatch(setDriftCheckLoading(true));
    try {
      const res = await axiosInstance.post('/canvas/deploy/drift-check', { cardId, nodes });
      if (res.data?.driftResults) {
        dispatch(setDriftResults(res.data.driftResults));
        // Update canvas node statuses to reflect drift
        for (const result of res.data.driftResults) {
          if (result.status === 'drifted' || result.status === 'missing') {
            dispatch(updateCardNodeData({ nodeId: result.nodeId, data: { status: 'drifted' } }));
          } else if (result.status === 'in_sync') {
            dispatch(updateCardNodeData({ nodeId: result.nodeId, data: { status: 'active' } }));
          }
        }
      }
    } catch {
      dispatch(setDriftCheckLoading(false));
    }
  };

  return (
    <div className="px-3 py-2">
      <button
        onClick={handleCheckDrift}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-ice-xs font-medium rounded border border-ice-border text-ice-text-2 hover:bg-ice-hover transition-colors disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <div className="w-3 h-3 border border-ice-text-3 border-t-transparent rounded-full animate-spin" />
            {t('properties.drift.checkingButton')}
          </>
        ) : (
          t('properties.drift.checkButton')
        )}
      </button>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="pt-3 pb-2 px-3">
    {title && (
      <div className="text-ice-2xs font-medium tracking-wide text-ice-text-3/50 mb-2">{title}</div>
    )}
    <div className="space-y-1">{children}</div>
  </div>
);

// ─── Field components ───────────────────────────────────────────────────────

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-[140px] bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
    />
  </div>
);

const NumberField: React.FC<{
  label: string;
  value: number | string;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-[140px] bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors"
    />
  </div>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <IceSelect value={value} onChange={onChange} options={options} width="140px" />
  </div>
);

const BooleanField: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <button
      onClick={() => onChange(!value)}
      className={`w-7 h-3.5 rounded-full transition-colors relative ${value ? 'bg-blue-500' : 'bg-ice-border'}`}
    >
      <div
        className={`w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-transform ${value ? 'translate-x-3.5' : 'translate-x-0.5'}`}
      />
    </button>
  </div>
);

const ListField: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}> = ({ label, value, onChange, placeholder, addLabel }) => (
  <div className="py-1 space-y-1.5">
    <span className="text-ice-xs text-ice-text-3">{label}</span>
    <div className="space-y-0.5">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const updated = [...value];
              updated[i] = e.target.value;
              onChange(updated);
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
          />
          <button
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-xs"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, ''])}
        className="text-ice-2xs text-ice-text-3/50 hover:text-ice-accent transition-colors"
      >
        + {addLabel || 'Add item'}
      </button>
    </div>
  </div>
);

const StepperField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min = 0, max = 99, onChange }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-5 h-5 flex items-center justify-center rounded text-ice-text-3 text-ice-xs hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center text-ice-xs text-ice-text-1 font-mono tabular-nums">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-5 h-5 flex items-center justify-center rounded text-ice-text-3 text-ice-xs hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
      >
        +
      </button>
    </div>
  </div>
);

// ─── Resource info panel (bottom half) ───────────────────────────────────────

const InfoRow: React.FC<{
  label: string;
  value: string | number;
  color?: string;
}> = ({ label, value, color }) => (
  <div className="flex items-center justify-between py-px">
    <span className="text-ice-2xs text-ice-text-3/50">{label}</span>
    <span className={`text-ice-2xs font-mono ${color || 'text-ice-text-2'}`}>{value}</span>
  </div>
);

// ─── Rich select field (card picker for optionDetails) ────────────────────

const RichSelectField: React.FC<{
  label: string;
  value: string;
  options: OptionDetail[];
  description?: string;
  onChange: (v: string) => void;
}> = ({ label, value, options, description, onChange }) => (
  <div className="py-1 space-y-1.5">
    <div>
      <span className="text-ice-xs text-ice-text-3">{label}</span>
      {description && <p className="text-ice-2xs text-ice-text-3/40 mt-0.5">{description}</p>}
    </div>
    <div className="space-y-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'w-full text-left px-2 py-1 rounded transition-colors',
            value === opt.value
              ? 'bg-blue-500/[0.08] text-ice-text-1'
              : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-ice-xs font-mono">{opt.label}</span>
            {opt.cost && (
              <span className="text-ice-2xs text-emerald-400/60 shrink-0">{opt.cost}</span>
            )}
          </div>
          {opt.description && (
            <div className="text-ice-2xs text-ice-text-3/40 mt-0.5">{opt.description}</div>
          )}
        </button>
      ))}
    </div>
  </div>
);

// ─── Tiered property fields ────────────────────────────────────────────────

function renderPropertyField(
  prop: HighLevelProperty,
  value: unknown,
  onChange: (field: string, value: unknown) => void,
): React.ReactNode {
  // Select with optionDetails — use IceSelect dropdown
  if (prop.type === 'select' && prop.optionDetails && prop.optionDetails.length > 0) {
    const strVal = value != null ? String(value) : (prop.default != null ? String(prop.default) : '');
    return (
      <div key={prop.name} className="flex items-center justify-between gap-2 py-1">
        <span className="text-ice-xs text-ice-text-3 shrink-0">{prop.label}</span>
        <IceSelect
          value={strVal}
          width="160px"
          onChange={(v) => {
            onChange(prop.name, v);
            const detail = prop.optionDetails!.find((o) => o.value === v);
            if (detail) {
              const displayParts = [detail.label, detail.description].filter(Boolean);
              onChange(`${prop.name}_display`, displayParts.join(' \u00b7 '));
            }
          }}
          options={prop.optionDetails.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.cost ? `${o.description || ''} ${o.cost}`.trim() : o.description,
          }))}
        />
      </div>
    );
  }
  if (prop.type === 'list') {
    const listVal = Array.isArray(value) ? (value as string[]) : [];
    return (
      <ListField
        key={prop.name}
        label={prop.label}
        value={listVal}
        onChange={(v) => onChange(prop.name, v)}
        placeholder={prop.placeholder}
        addLabel={prop.addLabel}
      />
    );
  }
  if (prop.type === 'select' && prop.options) {
    return (
      <SelectField
        key={prop.name}
        label={prop.label}
        value={value != null ? String(value) : ''}
        options={prop.options}
        onChange={(v) => onChange(prop.name, v)}
      />
    );
  }
  if (prop.type === 'boolean') {
    return (
      <BooleanField
        key={prop.name}
        label={prop.label}
        value={value != null ? !!value : !!prop.default}
        onChange={(v) => onChange(prop.name, v)}
      />
    );
  }
  if (prop.type === 'number') {
    return (
      <NumberField
        key={prop.name}
        label={prop.label}
        value={value != null ? Number(value) : prop.default != null ? Number(prop.default) : ''}
        onChange={(v) => onChange(prop.name, v)}
      />
    );
  }
  return (
    <TextField
      key={prop.name}
      label={prop.label}
      value={value != null ? String(value) : ''}
      onChange={(v) => onChange(prop.name, v)}
      placeholder={prop.placeholder}
    />
  );
}

const PropertyFields: React.FC<{
  properties: HighLevelProperty[];
  nodeData: Record<string, unknown>;
  onFieldChange: (field: string, value: unknown) => void;
}> = ({ properties, nodeData, onFieldChange }) => {
  const [showMore, setShowMore] = React.useState(false);
  const provider = ((nodeData.provider as string) || '').toLowerCase();

  // Filter optionDetails by the node's cloud provider
  const filterByProvider = (prop: HighLevelProperty): HighLevelProperty => {
    if (!prop.optionDetails || !provider) return prop;
    const filtered = prop.optionDetails.filter((o) => !o.provider || o.provider === provider);
    return filtered.length > 0 ? { ...prop, optionDetails: filtered } : prop;
  };

  const essential = properties.filter((p) => !p.tier || p.tier === 'essential');
  const detailed = properties.filter((p) => p.tier === 'detailed');
  // advanced tier is intentionally hidden from the UI

  return (
    <>
      {/* Essential fields — always visible */}
      {essential.length > 0 && (
        <Section title="Configuration">
          {essential.map((prop) => renderPropertyField(filterByProvider(prop), nodeData[prop.name], onFieldChange))}
        </Section>
      )}

      {/* Detailed fields — behind "More options" */}
      {detailed.length > 0 && (
        <>
          <button
            onClick={() => setShowMore(!showMore)}
            className="w-full flex items-center gap-1 px-3 py-2 text-ice-2xs text-ice-text-3/50 hover:text-ice-text-2 transition-colors"
          >
            <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${showMore ? 'rotate-90' : ''}`} />
            {showMore ? 'Fewer options' : `More options (${detailed.length})`}
          </button>
          {showMore && (
            <Section title="Details">
              {detailed.map((prop) => renderPropertyField(filterByProvider(prop), nodeData[prop.name], onFieldChange))}
            </Section>
          )}
        </>
      )}
    </>
  );
};

// ResourceInfoPanel removed — IaC mapping, network ports, and about section
// were technical details that confused non-technical users

// ─── Main PropertiesPanel ────────────────────────────────────────────────────

export const PropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const { selectedNodes, selectedEdges } = useSelector((state: RootState) => state.selection);

  // ─── Properties tab state ──────────────────────────────────────────────────
  const [propsTab, setPropsTab] = useState<string>('config');

  // ─── Load resource schemas from core DB via IPC ───────────────────────────
  const [resourceMap, setResourceMap] = useState<Map<string, ResourceDef>>(new Map());

  useEffect(() => {
    getApi()
      .resources.getAll()
      .then((data: ResourceDef[] | ResourceCategory[]) => {
        const map = new Map<string, ResourceDef>();
        // Handle both flat array (from /resources/all) and nested categories
        const resources =
          Array.isArray(data) && data.length > 0 && 'resources' in data[0]
            ? (data as ResourceCategory[]).flatMap((cat) => cat.resources)
            : (data as ResourceDef[]);
        for (const r of resources) {
          // Key by multiple fields for reliable lookup
          const id = (r as any).id || r.ice_type;
          if (id) map.set(id, r);
          if (r.ice_type && r.ice_type !== id) map.set(r.ice_type, r);
        }
        setResourceMap(map);
      })
      .catch(() => {
        // API not available — resourceMap stays empty
      });
  }, []);

  // Resolve selected node
  const selectedNodeId = selectedNodes[selectedNodes.length - 1] || null;
  const selectedNode: CardNode | undefined = useMemo(
    () => activeCard?.nodes.find((n) => n.id === selectedNodeId),
    [activeCard, selectedNodeId],
  );

  // Resolve active environment name
  const projectId = activeCard?.projectId || (selectedNode?.data?.projectId as string) || '';
  const activeEnvId = useSelector((s: RootState) => (projectId ? s.environments.activeEnvId[projectId] : undefined));
  const activeEnvs = useSelector((s: RootState) => (projectId ? s.environments.byProject[projectId] : undefined));
  const activeEnvName = activeEnvs?.find((e: any) => e.id === activeEnvId)?.name || 'production';

  // Resolve selected edge
  const selectedEdgeId = selectedEdges[selectedEdges.length - 1] || null;
  const selectedEdge: CardEdge | undefined = useMemo(
    () => activeCard?.edges.find((e) => e.id === selectedEdgeId),
    [activeCard, selectedEdgeId],
  );

  // Handlers for node data
  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedNodeId) return;
      dispatch(updateCardNodeData({ nodeId: selectedNodeId, data: { [field]: value } }));
    },
    [dispatch, selectedNodeId],
  );

  // Handlers for edge data
  const updateEdgeField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedEdgeId) return;
      dispatch(updateCardEdgeData({ edgeId: selectedEdgeId, data: { [field]: value } }));
    },
    [dispatch, selectedEdgeId],
  );

  // Source tab state — "repo" or "image" (must be before any early returns for Rules of Hooks)
  const nodeRepo = (selectedNode?.data?.repository as string) || '';
  const nodeImage = (selectedNode?.data?.image as string) || '';
  const [, setSourceTab] = useState<'repo' | 'image'>(nodeImage && !nodeRepo ? 'image' : 'repo');

  // Sync tab when switching nodes
  useEffect(() => {
    setSourceTab(nodeImage && !nodeRepo ? 'image' : 'repo');
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Project-level stats (must be before any early returns to satisfy Rules of Hooks)
  const totalNodes = activeCard?.nodes.length || 0;
  const totalEdges = activeCard?.edges.length || 0;
  const totalCost = useMemo(() => {
    if (!activeCard) return 0;
    return activeCard.nodes.reduce((sum, n) => {
      const cost = (n.data?.estimatedCost as string) || '';
      return sum + parseCostRange(cost);
    }, 0);
  }, [activeCard]);

  // ═══ EDGE SELECTED ═══
  if (selectedEdge && activeCard) {
    const sourceNode = activeCard.nodes.find((n) => n.id === selectedEdge.source);
    const targetNode = activeCard.nodes.find((n) => n.id === selectedEdge.target);
    const sourceLabel = (sourceNode?.data?.label as string) || selectedEdge.source;
    const targetLabel = (targetNode?.data?.label as string) || selectedEdge.target;
    const edgeData = selectedEdge.data || {};
    const srcIceType = (sourceNode?.data?.iceType as string) || '';
    const tgtIceType = (targetNode?.data?.iceType as string) || '';

    // Compute validation warnings for this connection
    const edgeWarnings: Array<{ level: string; message: string; suggestion?: string }> = [];
    // Inline lightweight checks (avoiding importing from canvas utils in properties)
    if (/StaticSite|SSRSite|Frontend/i.test(srcIceType) && /Database|PostgreSQL|MySQL|MongoDB/i.test(tgtIceType)) {
      edgeWarnings.push({
        level: 'warning',
        message: t('properties.edge.warningDbFromFrontend'),
        suggestion: t('properties.edge.warningDbSuggestion'),
      });
    }
    if (/StaticSite|SSRSite|Frontend/i.test(srcIceType) && /Queue|SQS|SNS|PubSub|RabbitMQ/i.test(tgtIceType)) {
      edgeWarnings.push({
        level: 'warning',
        message: t('properties.edge.warningQueueFromClient'),
        suggestion: t('properties.edge.warningQueueSuggestion'),
      });
    }

    return (
      <div id="ice-properties-panel" className="h-full flex flex-col bg-ice-surface overflow-y-auto">
        {/* Header */}
        <div className="px-3 py-3 border-b border-ice-border">
          <div className="flex items-center justify-between">
            <div className="text-ice-xs uppercase tracking-wider text-ice-text-3 mb-1">{t('properties.edge.connectionHeader')}</div>
            <CloseButton onClick={() => dispatch(toggleProperties())} />
          </div>
          <div className="text-ice-base text-ice-text-1 font-medium truncate">
            {sourceLabel} → {targetLabel}
          </div>
        </div>

        {/* Validation warnings */}
        {edgeWarnings.length > 0 && (
          <div className="px-3 pt-2 space-y-1.5">
            {edgeWarnings.map((w, i) => (
              <div key={i} className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                <div className="text-ice-xs text-amber-400 font-medium">{w.message}</div>
                {w.suggestion && <div className="text-ice-2xs text-ice-text-3 mt-0.5">{w.suggestion}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Visual source → target */}
        <div className="px-3 py-3 border-b border-ice-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center">
              <div className="text-ice-sm font-medium text-ice-text-1 truncate">{sourceLabel}</div>
              <div className="text-ice-2xs text-ice-text-3 font-mono truncate">
                {(sourceNode?.data?.iceType as string)?.split('.').pop() || 'node'}
              </div>
            </div>
            <div className="flex flex-col items-center shrink-0 gap-0.5">
              <div className="w-10 h-px bg-ice-border relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-l-ice-text-3 border-y-[3px] border-y-transparent" />
              </div>
              {((edgeData.connectionCategory as string) || (edgeData.relationship as string)) && (
                <span className="text-ice-2xs text-ice-text-3 font-mono">
                  {(edgeData.connectionCategory as string) ||
                    ((edgeData.relationship as string) || '').replace('_', ' ')}
                </span>
              )}
            </div>
            <div className="flex-1 text-center">
              <div className="text-ice-sm font-medium text-ice-text-1 truncate">{targetLabel}</div>
              <div className="text-ice-2xs text-ice-text-3 font-mono truncate">
                {(targetNode?.data?.iceType as string)?.split('.').pop() || 'node'}
              </div>
            </div>
          </div>
        </div>

        {/* Properties */}
        <Section title={t('properties.edge.propertiesSection')}>
          {/* Port — unified with env var when EnvVars block is connected */}
          {(() => {
            const sourceId = selectedEdge.source;
            const envNode = activeCard.nodes.find((n) => {
              if ((n.data?.iceType as string) !== 'Config.EnvVars') return false;
              return activeCard.edges.some(
                (e) => (e.source === sourceId && e.target === n.id) || (e.target === sourceId && e.source === n.id),
              );
            });
            const vars = (envNode?.data?.variables as Array<{ name: string; value: string }>) || [];
            const currentEnvVar = (edgeData.envVarName as string) || '';
            const currentPort = edgeData.port != null ? String(edgeData.port) : '';

            if (envNode) {
              return (
                <div className="space-y-1">
                  <label className="text-ice-2xs text-ice-text-3">{t('properties.edge.portLabel')}</label>
                  <div className="flex items-center gap-1">
                    <select
                      value={currentEnvVar}
                      onChange={(e) => {
                        const picked = e.target.value;
                        updateEdgeField('envVarName', picked || null);
                        if (picked) {
                          const match = vars.find((v) => v.name === picked);
                          if (match?.value && /^\d+$/.test(match.value.trim())) {
                            updateEdgeField('port', Number(match.value.trim()));
                          }
                        }
                      }}
                      className="flex-1 min-w-0 px-1.5 py-1.5 text-ice-sm rounded-l border border-ice-border bg-ice-base text-amber-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="" className="text-ice-text-1">
                        {t('properties.edge.customOption')}
                      </option>
                      {vars.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-ice-text-3 text-ice-sm">=</span>
                    <input
                      type="text"
                      value={currentPort}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateEdgeField('port', val ? Number(val) : null);
                        if (currentEnvVar && envNode) {
                          const updatedVars = [...vars];
                          const idx = updatedVars.findIndex((v) => v.name === currentEnvVar);
                          if (idx !== -1) {
                            updatedVars[idx] = { ...updatedVars[idx], value: val };
                            dispatch(updateCardNodeData({ nodeId: envNode.id, data: { variables: updatedVars } }));
                          }
                        }
                      }}
                      placeholder="5432"
                      className="w-20 px-1.5 py-1.5 text-ice-sm rounded-r border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              );
            }

            return (
              <TextField
                label={t('properties.edge.portLabel')}
                value={currentPort}
                placeholder="e.g. 5432"
                onChange={(v) => updateEdgeField('port', v ? Number(v) : null)}
              />
            );
          })()}
        </Section>

        {/* Delete */}
        <div className="px-3 mt-2">
          <button
            onClick={() => dispatch(deleteCardEdge(selectedEdge.id))}
            className="w-full py-1.5 text-ice-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded hover:bg-red-950/50 transition-colors"
          >
            {t('properties.edge.deleteButton')}
          </button>
        </div>
      </div>
    );
  }

  // ═══ NODE SELECTED ═══
  if (selectedNode && activeCard) {
    const iceType = (selectedNode.data?.iceType as string) || '';
    const resourceId = (selectedNode.data?.resourceId as string) || '';
    const provider = (selectedNode.data?.provider as string) || '';
    const label = (selectedNode.data?.label as string) || '';
    const estimatedCost = (selectedNode.data?.estimatedCost as string) || '';

    // Look up properties from core DB — try resourceId first, then iceType
    const resourceDef = resourceMap.get(resourceId) || resourceMap.get(iceType);
    const dbProperties = resourceDef?.properties || [];
    const implementations = resourceDef?.implementations || [];

    // Scaling data
    const behavior = (selectedNode.data?.behavior as string) || '';
    const isScalable = behavior === 'scalable';
    const minInstances = selectedNode.data?.minInstances != null ? Number(selectedNode.data.minInstances) : null;
    const maxInstances = selectedNode.data?.maxInstances != null ? Number(selectedNode.data.maxInstances) : null;
    const activeInstances =
      selectedNode.data?.activeInstances != null ? Number(selectedNode.data.activeInstances) : null;
    const scalingMetric = (selectedNode.data?.scalingMetric as string) || '';
    const scalingThreshold =
      selectedNode.data?.scalingThreshold != null ? Number(selectedNode.data.scalingThreshold) : 70;

    // Get icon
    const brandIcon =
      getBrandIcon((selectedNode.data?.runtime as string) || '') || getBrandIcon(iceType) || getBrandIcon(label);
    const providerIcon = getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider);
    const iconUrl = brandIcon?.url || providerIcon?.icon || DEFAULT_ICON;

    // Connections for this node
    const incomingEdges = activeCard.edges.filter((e) => e.target === selectedNode.id);
    const outgoingEdges = activeCard.edges.filter((e) => e.source === selectedNode.id);

    return (
      <div id="ice-properties-panel" className="h-full flex flex-col bg-ice-surface overflow-y-auto">
        {/* Header */}
        <div className="px-3 py-3 border-b border-ice-border">
          <div className="flex items-center gap-2 mb-1.5">
            <img src={iconUrl} alt="" className="w-5 h-5" />
            <input
              id="ice-properties-node-name"
              type="text"
              defaultValue={label}
              key={selectedNode?.id}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== label) updateNodeField('label', v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="flex-1 bg-transparent border-none text-ice-md text-ice-text-1 font-semibold outline-none focus:bg-ice-raised rounded px-1 -ml-1 transition-colors"
            />
            <CloseButton onClick={() => dispatch(toggleProperties())} />
          </div>
          <div className="flex items-center gap-1.5">
            {resourceDef && (
              <span className="text-ice-2xs bg-ice-raised text-ice-text-2 px-1.5 py-0.5 rounded font-mono">
                {resourceDef.display_name}
              </span>
            )}
            {iceType && !resourceDef && (
              <span className="text-ice-2xs bg-ice-raised text-ice-text-2 px-1.5 py-0.5 rounded font-mono">
                {iceType}
              </span>
            )}
            {provider && (
              <span className="text-ice-2xs bg-blue-950/50 text-blue-400 px-1.5 py-0.5 rounded font-mono uppercase">
                {provider}
              </span>
            )}
          </div>
        </div>

        {/* ── Group color picker (only for container/group nodes) ── */}
        {selectedNode.type === 'container' && (
          <GroupColorPicker
            color={(selectedNode.data?.groupColor as string) || '#3b82f6'}
            onChange={(color) => updateNodeField('groupColor', color)}
          />
        )}

        {/* ── Navigation Tabs ── */}
        {(() => {
          const hasDeployment = !!selectedNode.data?.provider_id;
          const hasSource =
            (iceType.startsWith('Application.') || iceType === 'Network.Gateway' || iceType.startsWith('Block.')) &&
            iceType !== 'Source.Repository';
          const activeTab = propsTab;

          // Tabs are derived from the node's actual content — not hardcoded
          const tabs: Array<{ id: string; label: string; show: boolean; dot?: boolean }> = [];
          if (dbProperties.length > 0 || iceType === 'Config.EnvVars' || iceType === 'Networking.Domain') {
            tabs.push({ id: 'config', label: t('properties.tabs.config'), show: true });
          }
          if (isScalable) {
            tabs.push({ id: 'scaling', label: t('properties.tabs.scaling'), show: true });
          }
          if (iceType === 'Networking.Domain') {
            tabs.push({ id: 'domain', label: t('properties.tabs.domain'), show: true });
          }
          if (hasSource || iceType === 'Source.Repository') {
            tabs.push({ id: 'source', label: t('properties.tabs.source'), show: true });
          }
          if (incomingEdges.length > 0 || outgoingEdges.length > 0) {
            tabs.push({ id: 'connections', label: t('properties.tabs.connections'), show: true });
          }
          if (hasDeployment) {
            tabs.push({ id: 'deploy', label: t('properties.tabs.deploy'), show: true, dot: true });
          }
          const visibleTabs = tabs.filter((t) => t.show);
          // Fall back to first tab if current tab doesn't exist
          if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
            setPropsTab(visibleTabs[0].id);
          }

          return (
            <>
              {/* Tab bar — always shown when >1 tab */}
              {visibleTabs.length > 1 && (
                <div className="flex border-b border-ice-border shrink-0">
                  {visibleTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setPropsTab(tab.id)}
                      className={cn(
                        'flex-1 px-3 py-2 text-ice-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                        activeTab === tab.id
                          ? tab.id === 'deploy'
                            ? 'text-ice-text-1 border-b-2 border-emerald-500'
                            : 'text-ice-text-1 border-b-2 border-ice-accent'
                          : 'text-ice-text-3 hover:text-ice-text-2',
                      )}
                    >
                      {tab.dot && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* ════ DEPLOY TAB ════ */}
              {activeTab === 'deploy' && hasDeployment && (
                <div className="pt-1">
                  <DriftIndicator nodeId={selectedNode.id} />
                  <Section title={t('properties.deploy.current')}>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-ice-xs text-emerald-500 font-medium">{t('properties.deploy.live')}</span>
                      </div>
                      {!!selectedNode.data?.url && (
                        <div>
                          <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.urlLabel')}</div>
                          <a
                            href={selectedNode.data.url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ice-xs text-blue-400 hover:underline break-all"
                          >
                            {selectedNode.data.url as string}
                          </a>
                        </div>
                      )}
                      {!!selectedNode.data?.deployed_image && (
                        <div>
                          <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.imageLabel')}</div>
                          <div className="text-ice-xs text-ice-text-2 font-mono break-all">
                            {selectedNode.data.deployed_image as string}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.resourceIdLabel')}</div>
                        <div className="text-ice-xs text-ice-text-2 font-mono break-all">
                          {selectedNode.data.provider_id as string}
                        </div>
                      </div>
                      {!!selectedNode.data?.region && (
                        <div>
                          <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.regionLabel')}</div>
                          <div className="text-ice-xs text-ice-text-2">{selectedNode.data.region as string}</div>
                        </div>
                      )}
                      {!!selectedNode.data?.max_instances && (
                        <div>
                          <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.instancesLabel')}</div>
                          <div className="text-ice-xs text-ice-text-2">
                            {String(selectedNode.data.min_instances || 0)} – {String(selectedNode.data.max_instances)}
                          </div>
                        </div>
                      )}
                    </div>
                  </Section>
                  <DeployHistory cardId={activeCard.id} />
                  <DriftCheckButton cardId={activeCard.id} nodes={activeCard.nodes} />
                </div>
              )}

              {/* ════ SOURCE & CI TAB ════ */}
              {activeTab === 'source' && (
                <div className="pt-1">
                  {hasSource && (
                    <>
                      <ServiceSourceSection
                        nodeId={selectedNode!.id}
                        nodeRepo={nodeRepo}
                        nodeBranch={(selectedNode?.data?.branch as string) || ''}
                        activeCard={activeCard}
                      />
                      <PipelineSection
                        cardId={activeCard.id}
                        nodeId={selectedNode!.id}
                        nodeRepo={nodeRepo}
                        activeCard={activeCard}
                      />
                    </>
                  )}
                  {iceType === 'Source.Repository' && (
                    <SourceRepositorySection
                      nodeRepo={nodeRepo}
                      nodeBranch={(selectedNode?.data?.branch as string) || 'main'}
                      buildCommand={(selectedNode?.data?.buildCommand as string) || ''}
                      outputDirectory={(selectedNode?.data?.outputDirectory as string) || ''}
                      onUpdateField={updateNodeField}
                      sourceNodeId={selectedNode!.id}
                      activeCard={activeCard}
                      activeEnvName={activeEnvName}
                    />
                  )}
                </div>
              )}

              {/* ════ SCALING TAB ════ */}
              {activeTab === 'scaling' && isScalable && (
                <Section title="">
                  {activeInstances != null && (
                    <div className="flex items-center justify-between gap-2 py-1">
                      <span className="text-ice-sm text-ice-text-2 shrink-0">{t('properties.scaling.active')}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-ice-base text-emerald-400 font-mono font-semibold">
                          {activeInstances} {t('properties.scaling.running')}
                        </span>
                      </div>
                    </div>
                  )}
                  <StepperField
                    label={t('properties.scaling.minInstances')}
                    value={minInstances ?? 1}
                    min={0}
                    max={maxInstances ?? 99}
                    onChange={(v) => updateNodeField('minInstances', v)}
                  />
                  <StepperField
                    label={t('properties.scaling.maxInstances')}
                    value={maxInstances ?? 3}
                    min={minInstances ?? 0}
                    max={99}
                    onChange={(v) => updateNodeField('maxInstances', v)}
                  />
                  <SelectField
                    label={t('properties.scaling.scaleOn')}
                    value={scalingMetric}
                    options={['cpu', 'memory', 'requests', 'queue_depth', 'custom']}
                    onChange={(v) => updateNodeField('scalingMetric', v)}
                  />
                  {scalingMetric && scalingMetric !== 'custom' && (
                    <NumberField
                      label={t('properties.scaling.threshold')}
                      value={scalingThreshold}
                      onChange={(v) => updateNodeField('scalingThreshold', v)}
                    />
                  )}
                </Section>
              )}

              {/* ════ DOMAIN TAB ════ */}
              {activeTab === 'domain' && iceType === 'Networking.Domain' && (
                <Section title="">
                  <div className="space-y-2">
                    <TextField
                      label={t('properties.domain.hostname')}
                      value={(selectedNode?.data?.hostname as string) || ''}
                      placeholder={t('properties.domain.hostnamePlaceholder')}
                      onChange={(v) => updateNodeField('hostname', v)}
                    />
                    <TextField
                      label={t('properties.domain.subdomain')}
                      value={(selectedNode?.data?.subdomain as string) || ''}
                      placeholder={t('properties.domain.subdomainPlaceholder')}
                      onChange={(v) => updateNodeField('subdomain', v)}
                    />
                    <SelectField
                      label={t('properties.domain.sslMode')}
                      value={(selectedNode?.data?.sslMode as string) || 'auto'}
                      options={['auto', 'manual', 'none']}
                      onChange={(v) => updateNodeField('sslMode', v)}
                    />
                    <TextField
                      label={t('properties.domain.dnsProvider')}
                      value={(selectedNode?.data?.dnsProvider as string) || ''}
                      placeholder={t('properties.domain.dnsProviderPlaceholder')}
                      onChange={(v) => updateNodeField('dnsProvider', v)}
                    />
                  </div>
                </Section>
              )}

              {/* ════ CONNECTIONS TAB ════ */}
              {activeTab === 'connections' && (incomingEdges.length > 0 || outgoingEdges.length > 0) && (
                <div className="px-2 py-1 space-y-0">
                  {[...incomingEdges, ...outgoingEdges].map((edge) => (
                    <ConnectionCard
                      key={edge.id}
                      edge={edge}
                      thisNodeId={selectedNode!.id}
                      nodes={activeCard.nodes}
                      dispatch={dispatch}
                    />
                  ))}
                </div>
              )}

              {/* ════ CONFIG TAB ════ */}
              {activeTab === 'config' && (
                <>
                  {/* Configuration fields — tiered */}
                  {dbProperties.length > 0 && (
                    <PropertyFields
                      properties={dbProperties}
                      nodeData={selectedNode.data || {}}
                      onFieldChange={updateNodeField}
                    />
                  )}

                  {/* Source.Repository (when no tabs) */}
                  {visibleTabs.length <= 1 && iceType === 'Source.Repository' && (
                    <SourceRepositorySection
                      nodeRepo={nodeRepo}
                      nodeBranch={(selectedNode?.data?.branch as string) || 'main'}
                      buildCommand={(selectedNode?.data?.buildCommand as string) || ''}
                      outputDirectory={(selectedNode?.data?.outputDirectory as string) || ''}
                      onUpdateField={updateNodeField}
                      sourceNodeId={selectedNode!.id}
                      activeCard={activeCard}
                      activeEnvName={activeEnvName}
                    />
                  )}

                  {/* Source (when no tabs) */}
                  {visibleTabs.length <= 1 && hasSource && (
                    <>
                      <ServiceSourceSection
                        nodeId={selectedNode!.id}
                        nodeRepo={nodeRepo}
                        nodeBranch={(selectedNode?.data?.branch as string) || ''}
                        activeCard={activeCard}
                      />
                      <PipelineSection
                        cardId={activeCard.id}
                        nodeId={selectedNode!.id}
                        nodeRepo={nodeRepo}
                        activeCard={activeCard}
                      />
                    </>
                  )}

                  {/* Environment Variables */}
                  {iceType === 'Config.EnvVars' && (
                    <EnvVarsEditor
                      variables={
                        (selectedNode?.data?.variables as Array<{ name: string; value: string; isSecret?: boolean }>) ||
                        []
                      }
                      onChange={(vars) => updateNodeField('variables', vars)}
                    />
                  )}

                  {/* Cost */}
                  {estimatedCost && (
                    <Section title={t('properties.config.cost')}>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-ice-sm text-ice-text-2">{t('properties.config.estimatedMonthly')}</span>
                        <span className="text-ice-sm text-emerald-400 font-mono">{estimatedCost}</span>
                      </div>
                    </Section>
                  )}

                  {/* Cost estimate (if available) */}
                </>
              )}
            </>
          );
        })()}
      </div>
    );
  }

  // ═══ NOTHING SELECTED — Project Overview ═══
  return (
    <div id="ice-properties-panel" className="h-full flex flex-col bg-ice-surface border-l">
      <div className="px-3 py-3 border-b border-ice-border">
        <div className="flex items-center justify-between">
          <div className="text-ice-xs uppercase tracking-wider text-ice-text-3 mb-1">{t('properties.title')}</div>
          <CloseButton onClick={() => dispatch(toggleProperties())} />
        </div>
        <div className="text-ice-md text-ice-text-1 font-semibold">{activeCard?.name || t('properties.noCard')}</div>
      </div>

      <Section title={t('properties.overview.title')}>
        <div className="flex items-center justify-between py-1">
          <span className="text-ice-sm text-ice-text-2">{t('properties.overview.nodes')}</span>
          <span className="text-ice-sm text-ice-text-1 font-mono">{totalNodes}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-ice-sm text-ice-text-2">{t('properties.overview.connections')}</span>
          <span className="text-ice-sm text-ice-text-1 font-mono">{totalEdges}</span>
        </div>
        {totalCost > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-ice-sm text-ice-text-2">{t('properties.overview.estMonthlyCost')}</span>
            <span className="text-ice-sm text-emerald-400 font-mono">{formatCost(totalCost)}</span>
          </div>
        )}
      </Section>

      {/* Canvas pattern suggestions */}
      {activeCard &&
        activeCard.nodes.length > 0 &&
        (() => {
          const hints = analyzeCanvasPatterns(
            activeCard.nodes as Array<{ id: string; data?: Record<string, unknown> }>,
            activeCard.edges.map((e) => ({ source: e.source, target: e.target })),
          );
          if (hints.length === 0) return null;
          return (
            <Section title={t('properties.overview.suggestions')}>
              <div className="space-y-1.5">
                {hints.map((h, i) => (
                  <div key={i} className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
                    <div className="text-ice-xs text-blue-400">{h.message}</div>
                  </div>
                ))}
              </div>
            </Section>
          );
        })()}

      {activeCard && activeCard.nodes.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">
            {t('properties.overview.emptyHint')}
          </p>
        </div>
      )}

      {activeCard && activeCard.nodes.length > 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">
            {t('properties.overview.selectHint')}
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Pipeline Section (inline in Properties panel) ──────────────────────────

const PipelineSection: React.FC<{
  cardId: string;
  nodeId: string;
  nodeRepo: string;
  activeCard: any;
}> = ({ cardId, nodeId, nodeRepo, activeCard }) => {
  const dispatch = useDispatch<AppDispatch>();
  const key = `${cardId}:${nodeId}`;
  const rules = useSelector((s: RootState) => s.pipeline.rules[key] || []);
  const rulesLoaded = useSelector((s: RootState) => key in s.pipeline.rules);
  const rulesLoading = useSelector((s: RootState) => s.pipeline.rulesLoading);
  const events = useSelector((s: RootState) => s.pipeline.history[key] || []);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Resolve repository from this node or a connected Source.Repository block
  let repository = nodeRepo;
  if (!repository && activeCard && nodeId) {
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connectedEdges = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connectedEdges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        repository = (otherNode.data.repository as string) || '';
        break;
      }
    }
  }

  const branches = useSelector((s: RootState) => (repository ? s.integrations.github.branches[repository] || [] : []));

  // Fetch rules + branches on mount
  useEffect(() => {
    if (!cardId || !nodeId) return;
    dispatch(fetchRulesForNode({ cardId, nodeId }));
    dispatch(fetchEventsForNode({ cardId, nodeId }));
    if (repository && branches.length === 0) {
      dispatch(fetchGitHubBranches(repository));
    }
  }, [cardId, nodeId, repository, branches.length, dispatch]);

  // Auto-create default rule when rules load empty
  const [autoCreated, setAutoCreated] = useState(false);
  useEffect(() => {
    if (!repository || !rulesLoaded || autoCreated || rules.length > 0) return;
    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: defaultBranch,
        environment: 'production',
      }),
    )
      .then(() => dispatch(fetchRulesForNode({ cardId, nodeId })))
      .catch((err: any) => console.error('[Pipeline] Auto-create failed:', err));
  }, [repository, rulesLoaded, rules.length, autoCreated, branches, cardId, dispatch, nodeId]);

  // No repo connected → don't show the section
  if (!repository) return null;

  const handleAddRule = () => {
    const usedBranches = new Set(rules.map((r) => r.branch_pattern));
    const unused = branches.find((b) => !usedBranches.has(b.name));
    const branchName = unused?.name || 'develop';
    const env =
      branchName === 'main' || branchName === 'master'
        ? 'production'
        : branchName.includes('stag')
          ? 'staging'
          : 'development';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: branchName,
        environment: env,
      }),
    ).then(() => dispatch(fetchRulesForNode({ cardId, nodeId })));
  };

  const handleRetry = (eventId: string) => {
    import('../../../store/slices/pipeline-slice').then(({ default: _, ..._mod }) => {
      // retryDeploy is on the API adapter, not a thunk — call it directly
      import('../../../shared/api/api-adapter').then(({ getApi }) => {
        getApi()
          .pipeline.retryDeploy(eventId)
          .then(() => {
            dispatch(fetchEventsForNode({ cardId, nodeId }));
          });
      });
    });
  };

  const formatAge = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <Section title={t('pipeline.serviceDeploys')}>
      {/* Loading */}
      {(rulesLoading || (autoCreated && rules.length === 0)) && (
        <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.settingUp')}</div>
      )}

      {/* Trigger rules */}
      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-1.5 text-ice-xs rounded border px-2 py-1.5 ${
                rule.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 opacity-50'
              }`}
            >
              {/* Toggle */}
              <button
                onClick={() => dispatch(updatePipelineRule({ ruleId: rule.id, updates: { enabled: !rule.enabled } }))}
                className={`w-6 h-3.5 rounded-full relative shrink-0 transition-colors ${rule.enabled ? 'bg-emerald-500' : 'bg-ice-border'}`}
              >
                <div
                  className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${rule.enabled ? 'left-3' : 'left-0.5'}`}
                />
              </button>

              <span className="text-ice-text-3">push</span>

              {/* Branch */}
              <select
                value={rule.branch_pattern}
                onChange={(e) =>
                  dispatch(updatePipelineRule({ ruleId: rule.id, updates: { branchPattern: e.target.value } }))
                }
                className="px-1 py-0.5 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono max-w-[80px]"
              >
                {branches.length > 0 ? (
                  <>
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                    <option value="*">*</option>
                  </>
                ) : (
                  <>
                    <option value={rule.branch_pattern}>{rule.branch_pattern}</option>
                    <option value="*">*</option>
                  </>
                )}
              </select>

              <span className="text-ice-text-3">&rarr;</span>

              {/* Environment */}
              <select
                value={rule.environment}
                onChange={(e) =>
                  dispatch(updatePipelineRule({ ruleId: rule.id, updates: { environment: e.target.value } }))
                }
                className="px-1 py-0.5 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 max-w-[85px]"
              >
                <option value="production">production</option>
                <option value="staging">staging</option>
                <option value="development">development</option>
              </select>

              {/* Delete */}
              <button
                onClick={() =>
                  dispatch(deletePipelineRule({ ruleId: rule.id, cardId: rule.card_id, nodeId: rule.node_id }))
                }
                className="ml-auto text-ice-text-3 hover:text-red-400 transition-colors"
                title={t('pipeline.removeTrigger')}
              >
                &times;
              </button>
            </div>
          ))}

          {/* Add trigger */}
          <button onClick={handleAddRule} className="text-ice-xs text-ice-text-3 hover:text-blue-400 transition-colors">
            {t('pipeline.addTrigger')}
          </button>
        </div>
      )}

      {/* Recent deployments with expandable logs */}
      {events.length > 0 && (
        <div className="mt-2 pt-2 border-t border-ice-border space-y-1">
          <div className="text-ice-xs text-ice-text-3 font-semibold uppercase tracking-wider mb-1">{t('pipeline.recent')}</div>
          {events.slice(0, 5).map((ev) => {
            const isExpanded = expandedEventId === ev.id;
            const logs = (ev.deployment_logs || []) as DeployStep[];
            return (
              <div key={ev.id} className="rounded border border-ice-border overflow-hidden">
                <div
                  className="flex items-center gap-1.5 text-ice-xs px-2 py-1.5 cursor-pointer hover:bg-ice-hover transition-colors"
                  onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ev.status === 'success'
                        ? 'bg-emerald-500'
                        : ev.status === 'failed'
                          ? 'bg-red-500'
                          : ev.status === 'building' || ev.status === 'deploying'
                            ? 'bg-blue-500 animate-pulse'
                            : ev.status === 'cancelled'
                              ? 'bg-ice-text-3'
                              : 'bg-ice-text-3'
                    }`}
                  />
                  <span className="font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                  <span className="text-ice-text-3 truncate flex-1">{ev.commit_message}</span>
                  <span className="text-ice-text-3 shrink-0">{formatAge(ev.started_at)}</span>
                  <span className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9662;</span>
                </div>

                {/* Expanded log viewer */}
                {isExpanded && (
                  <div className="border-t border-ice-border bg-slate-950 px-2 py-1.5 space-y-0.5 max-h-28 overflow-y-auto">
                    {logs.length > 0 ? (
                      logs.map((log, i) => (
                        <div key={i} className="flex items-center gap-1 text-ice-2xs font-mono">
                          <span
                            className={`shrink-0 ${
                              log.status === 'completed'
                                ? 'text-emerald-500'
                                : log.status === 'failed'
                                  ? 'text-red-400'
                                  : 'text-blue-400'
                            }`}
                          >
                            {log.status === 'completed' ? '\u2713' : log.status === 'failed' ? '\u2717' : '\u25CF'}
                          </span>
                          <span className={log.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>
                            {log.message}
                          </span>
                          {log.duration_ms != null && (
                            <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-ice-2xs font-mono text-slate-500">{t('pipeline.noLogs')}</div>
                    )}
                    {ev.error && (
                      <div className="text-ice-2xs font-mono text-red-400 pt-1 border-t border-slate-800">
                        {ev.error}
                      </div>
                    )}
                    {ev.duration_seconds != null && (
                      <div className="text-ice-2xs font-mono text-slate-500 pt-0.5">
                        {ev.duration_seconds < 60
                          ? `${ev.duration_seconds}s`
                          : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                      </div>
                    )}
                    {/* Retry button for failed deploys */}
                    {ev.status === 'failed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(ev.id);
                        }}
                        className="mt-1 px-2 py-0.5 text-ice-2xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                      >
                        {t('common.buttons.retry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
};

// ─── Service Source Section (read-only — shows linked repo or hint) ──────────

const ServiceSourceSection: React.FC<{
  nodeId: string;
  nodeRepo: string;
  nodeBranch: string;
  activeCard: any;
}> = ({ nodeId, nodeRepo, nodeBranch, activeCard }) => {
  // Find connected Source.Repository block
  let linkedRepo = nodeRepo;
  let linkedBranch = nodeBranch;
  let sourceBlockName = '';

  if (activeCard) {
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connected = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connected) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        linkedRepo = (otherNode.data.repository as string) || linkedRepo;
        linkedBranch = (otherNode.data.branch as string) || linkedBranch;
        sourceBlockName = (otherNode.data.label as string) || 'GitHub Repo';
        break;
      }
    }
  }

  if (linkedRepo) {
    return (
      <Section title={t('properties.source.title')}>
        <div className="rounded border border-ice-border bg-ice-raised px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-ice-sm font-mono text-ice-text-1">{linkedRepo}</span>
          </div>
          {linkedBranch && <div className="text-ice-xs text-ice-text-3 font-mono">&rarr; {linkedBranch}</div>}
          {sourceBlockName && (
            <div className="text-ice-xs text-ice-text-3">
              {t('properties.source.managedBy')} <span className="text-ice-text-2 font-medium">{sourceBlockName}</span> {t('properties.source.block')}
            </div>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section title={t('properties.source.title')}>
      <div className="rounded border border-dashed border-ice-border px-2.5 py-3 text-center space-y-1.5">
        <div className="text-ice-sm text-ice-text-3">{t('properties.source.noSourceConnected')}</div>
        <div className="text-ice-xs text-ice-text-3 leading-relaxed">
          {t('properties.source.noSourceHint')}
        </div>
      </div>
    </Section>
  );
};

// ─── Source.Repository Section (repo + branch + build + triggers) ────────────

const SourceRepositorySection: React.FC<{
  nodeRepo: string;
  nodeBranch: string;
  buildCommand: string;
  outputDirectory: string;
  onUpdateField: (field: string, value: unknown) => void;
  sourceNodeId: string;
  activeCard: any;
  activeEnvName: string;
}> = ({
  nodeRepo,
  nodeBranch,
  buildCommand,
  outputDirectory,
  onUpdateField,
  sourceNodeId,
  activeCard,
  activeEnvName,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const branches = useSelector((s: RootState) => (nodeRepo ? s.integrations.github.branches[nodeRepo] || [] : []));
  const pipelineNodeStatus = useSelector((s: RootState) => s.pipeline.nodeStatus);

  // Find connected service nodes (deploy targets)
  const connectedServices = useMemo(() => {
    if (!activeCard || !sourceNodeId) return [];
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connected = edges.filter((e: any) => e.source === sourceNodeId || e.target === sourceNodeId);
    const services: Array<{ id: string; label: string }> = [];
    for (const edge of connected) {
      const otherId = edge.source === sourceNodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode && otherNode.type === 'resource') {
        const otherIceType = (otherNode.data?.iceType as string) || '';
        if (!otherIceType.startsWith('Source.')) {
          services.push({
            id: otherNode.id,
            label: (otherNode.data?.label as string) || otherNode.id.slice(0, 8),
          });
        }
      }
    }
    return services;
  }, [activeCard, sourceNodeId]);

  // Fetch branches when repo changes
  useEffect(() => {
    if (nodeRepo && branches.length === 0) {
      dispatch(fetchGitHubBranches(nodeRepo));
    }
  }, [nodeRepo, branches.length, dispatch]);

  // Load rules for each connected service
  const cardId = activeCard?.id || '';
  useEffect(() => {
    for (const svc of connectedServices) {
      dispatch(fetchRulesForNode({ cardId, nodeId: svc.id }));
      dispatch(fetchEventsForNode({ cardId, nodeId: svc.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length to avoid re-firing on array reference changes
  }, [connectedServices.length, cardId, dispatch]);

  // Aggregate rules for all connected services
  const allRules = useSelector((s: RootState) => {
    const result: Array<DeploymentRule & { _serviceName: string }> = [];
    for (const svc of connectedServices) {
      const key = `${cardId}:${svc.id}`;
      const rules = s.pipeline.rules[key] || [];
      for (const r of rules) {
        result.push({ ...r, _serviceName: svc.label });
      }
    }
    return result;
  });

  const allEvents = useSelector((s: RootState) => {
    const result: DeploymentEvent[] = [];
    for (const svc of connectedServices) {
      const key = `${cardId}:${svc.id}`;
      const events = s.pipeline.history[key] || [];
      result.push(...events);
    }
    return result.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  });

  // Check if rules have loaded for at least one service
  const anyRulesLoaded = useSelector((s: RootState) =>
    connectedServices.some((svc) => `${cardId}:${svc.id}` in s.pipeline.rules),
  );

  // Auto-create default rule for first connected service if none exist
  const [autoCreated, setAutoCreated] = useState(false);
  useEffect(() => {
    if (!nodeRepo || !anyRulesLoaded || autoCreated || allRules.length > 0 || connectedServices.length === 0) return;
    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';
    const targetService = connectedServices[0];

    dispatch(
      createPipelineRule({
        cardId,
        nodeId: targetService.id,
        repository: nodeRepo,
        branchPattern: defaultBranch,
        environment: activeEnvName,
        buildCommand: buildCommand || undefined,
        installCommand: undefined,
        outputDir: outputDirectory || undefined,
      }),
    )
      .then(() => dispatch(fetchRulesForNode({ cardId, nodeId: targetService.id })))
      .catch((err: any) => console.error('[Pipeline] Auto-create failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length for arrays to avoid re-firing on reference changes; autoCreated guard prevents loops
  }, [
    nodeRepo,
    anyRulesLoaded,
    allRules.length,
    autoCreated,
    branches.length,
    connectedServices.length,
    cardId,
    dispatch,
    activeEnvName,
    buildCommand,
    outputDirectory,
  ]);

  const handleAddRule = (serviceId: string) => {
    // Find branches not already used for this env + service
    const envRulesForService = allRules.filter((r) => r.node_id === serviceId && r.environment === activeEnvName);
    const usedBranches = new Set(envRulesForService.map((r) => r.branch_pattern));
    const unused = branches.find((b) => !usedBranches.has(b.name));
    const branchName = unused?.name || 'main';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId: serviceId,
        repository: nodeRepo,
        branchPattern: branchName,
        environment: activeEnvName,
        buildCommand: buildCommand || undefined,
        outputDir: outputDirectory || undefined,
      }),
    ).then(() => dispatch(fetchRulesForNode({ cardId, nodeId: serviceId })));
  };

  return (
    <>
      {/* Repository */}
      <Section title={t('properties.source.repository')}>
        <RepoSelector
          value={nodeRepo}
          onChange={(repo) => {
            onUpdateField('repository', repo);
            if (repo && repo !== nodeRepo) {
              onUpdateField('branch', 'main');
              dispatch(fetchGitHubBranches(repo));
            }
          }}
        />
      </Section>

      {/* Branch */}
      {nodeRepo && (
        <Section title={t('properties.source.branch')}>
          <select
            value={nodeBranch}
            onChange={(e) => onUpdateField('branch', e.target.value)}
            className="w-full px-2 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {branches.length > 0 ? (
              branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.protected ? ` ${t('properties.source.branchProtected')}` : ''}
                </option>
              ))
            ) : (
              <>
                <option value={nodeBranch}>{nodeBranch}</option>
                {nodeBranch !== 'main' && <option value="main">main</option>}
                {nodeBranch !== 'master' && <option value="master">master</option>}
              </>
            )}
          </select>
        </Section>
      )}

      {/* Build */}
      {nodeRepo && (
        <Section title={t('properties.source.build')}>
          <div className="space-y-2">
            <TextField
              label={t('properties.source.buildCommand')}
              value={buildCommand}
              placeholder={t('properties.source.buildCommandPlaceholder')}
              onChange={(v) => onUpdateField('buildCommand', v)}
            />
            <TextField
              label={t('properties.source.outputDirectory')}
              value={outputDirectory}
              placeholder={t('properties.source.outputDirPlaceholder')}
              onChange={(v) => onUpdateField('outputDirectory', v)}
            />
          </div>
        </Section>
      )}

      {/* Triggers — filtered to active environment only */}
      {nodeRepo &&
        connectedServices.length > 0 &&
        (() => {
          const envRules = allRules.filter((r) => r.environment === activeEnvName);

          return (
            <Section title={`Triggers · ${activeEnvName}`}>
              {envRules.length === 0 && autoCreated && (
                <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.settingUp')}</div>
              )}

              {envRules.length === 0 && !autoCreated && (
                <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.noTriggersForEnv')}</div>
              )}

              {/* One row per connected service — toggle + trigger type + branch (read-only) + service name */}
              {connectedServices.map((svc) => {
                const svcRule = envRules.find((r) => r.node_id === svc.id);
                return (
                  <div
                    key={svc.id}
                    className={`flex items-center gap-1.5 text-ice-xs rounded border px-2 py-1.5 ${
                      svcRule?.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 opacity-50'
                    }`}
                  >
                    <span className={`text-ice-xs ${!svcRule?.enabled ? 'text-ice-text-1' : 'text-ice-text-3'}`}>
                      {t('pipeline.manual')}
                    </span>

                    {/* Toggle */}
                    <button
                      onClick={() => {
                        if (svcRule) {
                          dispatch(updatePipelineRule({ ruleId: svcRule.id, updates: { enabled: !svcRule.enabled } }));
                        } else {
                          handleAddRule(svc.id);
                        }
                      }}
                      className={`w-6 h-3.5 rounded-full relative shrink-0 transition-colors ${svcRule?.enabled ? 'bg-emerald-500' : 'bg-ice-border'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${svcRule?.enabled ? 'left-3' : 'left-0.5'}`}
                      />
                    </button>

                    <span className={`text-ice-xs ${svcRule?.enabled ? 'text-emerald-500' : 'text-ice-text-3'}`}>
                      {t('pipeline.auto')}
                    </span>

                    {/* Deploy button — always visible for manual trigger */}
                    {svcRule && !svcRule.enabled && (
                      <button
                        onClick={() => {
                          import('../../../store/slices/pipeline-slice').then(({ triggerManualDeploy }) => {
                            dispatch(triggerManualDeploy({ ruleId: svcRule.id }));
                          });
                        }}
                        className="ml-auto px-2 py-0.5 text-ice-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium"
                      >
                        {t('common.buttons.deploy')}
                      </button>
                    )}
                  </div>
                );
              })}
            </Section>
          );
        })()}

      {/* No services connected hint */}
      {nodeRepo && connectedServices.length === 0 && (
        <Section title={t('pipeline.triggers')}>
          <div className="text-ice-xs text-ice-text-3">
            {t('properties.noServiceHint')}
          </div>
        </Section>
      )}

      {/* Live build output — shows during active pipeline */}
      {connectedServices.length > 0 &&
        (() => {
          const activeStatuses = connectedServices
            .map((svc) => ({ svc, status: pipelineNodeStatus[svc.id] }))
            .filter(
              ({ status }) =>
                status && (status.status === 'building' || status.status === 'deploying' || status.status === 'queued'),
            );

          if (activeStatuses.length === 0) return null;

          return (
            <Section title={t('pipeline.liveBuild')}>
              <div className="rounded border border-ice-border bg-slate-950 p-2 max-h-32 overflow-y-auto font-mono text-ice-2xs leading-relaxed space-y-0.5">
                {activeStatuses.map(({ svc, status }) => {
                  // Elapsed time since build started
                  const elapsed = status!.startedAt
                    ? Math.round((Date.now() - new Date(status!.startedAt).getTime()) / 1000)
                    : 0;
                  const timeStr =
                    elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : '';
                  const timeoutWarn = elapsed > 240; // warn at 4 min (5 min limit)

                  return (
                    <div key={svc.id}>
                      <div className="text-blue-400 flex items-center gap-1 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                        {svc.label} — {status!.stage || status!.status}
                        {timeStr && (
                          <span className={`ml-auto ${timeoutWarn ? 'text-amber-400' : 'text-slate-500'}`}>
                            {timeStr}
                            {timeoutWarn ? ` ${t('pipeline.timeoutSoon')}` : ''}
                          </span>
                        )}
                      </div>
                      {status!.stage && status!.stage.startsWith('[') && (
                        <div className="text-slate-400 pl-3">{status!.stage}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          );
        })()}

      {/* Recent service deployments — grouped by service, with expandable logs */}
      {allEvents.length > 0 && (
        <RepoDeployList events={allEvents} connectedServices={connectedServices} cardId={cardId} />
      )}
    </>
  );
};

// ─── Deploy History ──────────────────────────────────────────────────────────

const DeployHistory: React.FC<{ cardId: string }> = ({ cardId }) => {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getApi().deploy.getDeployments(cardId);
        setHistory(Array.isArray(data) ? data.slice(0, 10) : []);
      } catch {
        // ignore
      }
    })();
  }, [cardId]);

  if (history.length === 0) return null;

  return (
    <Section title={t('properties.deploy.history')}>
      <div className="space-y-1">
        {history.map((d, i) => {
          const date = new Date(d.created_at);
          const time = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const duration = d.duration_ms ? `${(d.duration_ms / 1000).toFixed(1)}s` : '';
          const isSuccess = d.status === 'success';
          const isFailed = d.status === 'failed';
          return (
            <div key={d.id || i} className="flex items-center gap-2 py-1 text-ice-xs">
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  isSuccess ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-amber-500',
                )}
              />
              <span className="text-ice-text-2 truncate">{time}</span>
              <span
                className={cn(
                  'text-ice-2xs px-1 py-0.5 rounded',
                  isSuccess
                    ? 'text-emerald-400 bg-emerald-950/30'
                    : isFailed
                      ? 'text-red-400 bg-red-950/30'
                      : 'text-amber-400 bg-amber-950/30',
                )}
              >
                {d.status}
              </span>
              {duration && <span className="ml-auto text-ice-text-3 font-mono">{duration}</span>}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

// ─── Visual Connection Card ─────────────────────────────────────────────────

const ConnectionCard: React.FC<{
  edge: CardEdge;
  thisNodeId: string;
  nodes: CardNode[];
  dispatch: AppDispatch;
}> = ({ edge, thisNodeId, nodes, dispatch }) => {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceLabel = (sourceNode?.data?.label as string) || 'Unknown';
  const targetLabel = (targetNode?.data?.label as string) || 'Unknown';
  const sourceType = (sourceNode?.data?.iceType as string) || '';
  const targetType = (targetNode?.data?.iceType as string) || '';
  const sourceProvider = (sourceNode?.data?.provider as string) || 'aws';
  const targetProvider = (targetNode?.data?.provider as string) || 'aws';
  const d = edge.data || {};
  const port = d.port != null ? String(d.port) : '';
  const relationship = (d.connectionCategory as string) || (d.relationship as string) || '';

  const isOutgoing = edge.source === thisNodeId;
  const sourceIcon = getIcon(sourceType, sourceProvider as any);
  const targetIcon = getIcon(targetType, targetProvider as any);

  return (
    <div className="group flex items-center gap-0 py-3 px-1">
      {/* FROM node */}
      <div className="flex flex-col items-center flex-1 min-w-0">
        <div className="w-9 h-9 flex items-center justify-center mb-1.5">
          {sourceIcon ? (
            <img src={sourceIcon.icon} alt="" className="w-7 h-7" />
          ) : (
            <span className="text-ice-sm text-ice-text-3 font-semibold">{sourceType.split('.').pop()?.charAt(0) || '?'}</span>
          )}
        </div>
        <span className="text-ice-xs font-medium text-ice-text-1 truncate max-w-full text-center">
          {sourceLabel}
        </span>
      </div>

      {/* Arrow with port */}
      <div className="flex flex-col items-center shrink-0 px-1.5 gap-0.5">
        <div className="flex items-center gap-0.5">
          <div className="w-8 h-px bg-ice-text-3" />
          <div className="w-0 h-0 border-l-[5px] border-l-ice-text-3 border-y-[3px] border-y-transparent" />
        </div>
        {port && (
          <span className="text-ice-2xs font-mono text-ice-accent">:{port}</span>
        )}
        {!port && relationship && (
          <span className="text-ice-2xs text-ice-text-3">{relationship}</span>
        )}
      </div>

      {/* TO node */}
      <div className="flex flex-col items-center flex-1 min-w-0">
        <div className="w-9 h-9 flex items-center justify-center mb-1.5">
          {targetIcon ? (
            <img src={targetIcon.icon} alt="" className="w-7 h-7" />
          ) : (
            <span className="text-ice-sm text-ice-text-3 font-semibold">{targetType.split('.').pop()?.charAt(0) || '?'}</span>
          )}
        </div>
        <span className="text-ice-xs font-medium text-ice-text-1 truncate max-w-full text-center">
          {targetLabel}
        </span>
      </div>

      {/* Delete button */}
      <button
        onClick={() => dispatch(deleteCardEdge(edge.id))}
        className="ml-1 p-1 text-ice-text-3 hover:text-red-400 transition-colors shrink-0 rounded opacity-0 group-hover:opacity-100"
        title="Remove connection"
      >
        &times;
      </button>
    </div>
  );
};

// ─── Repo Deploy List (grouped by service, expandable logs) ─────────────────

const RepoDeployList: React.FC<{
  events: DeploymentEvent[];
  connectedServices: Array<{ id: string; label: string }>;
  cardId: string;
}> = ({ events, connectedServices, cardId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatAge = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <Section title={t('pipeline.serviceDeploys')}>
      <div className="space-y-1">
        {events.slice(0, 8).map((ev) => {
          const isExpanded = expandedId === ev.id;
          const logs = (ev.deployment_logs || []) as DeployStep[];
          return (
            <div key={ev.id} className="rounded border border-ice-border overflow-hidden">
              <div
                className="flex items-center gap-1.5 text-ice-xs px-2 py-1.5 cursor-pointer hover:bg-ice-hover transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : ev.id)}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    ev.status === 'success'
                      ? 'bg-emerald-500'
                      : ev.status === 'failed'
                        ? 'bg-red-500'
                        : ev.status === 'building' || ev.status === 'deploying'
                          ? 'bg-blue-500 animate-pulse'
                          : 'bg-ice-text-3'
                  }`}
                />
                <span className="font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                <span className="text-ice-text-3 truncate flex-1">{ev.commit_message}</span>
                <span className="text-ice-text-3 shrink-0">{ev.rule?.environment || ev.branch}</span>
                <span className="text-ice-text-3 shrink-0">{formatAge(ev.started_at)}</span>
                <span className={`shrink-0 text-ice-text-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  &#9662;
                </span>
              </div>

              {/* Expanded logs */}
              {isExpanded && (
                <div className="border-t border-ice-border bg-slate-950 px-2 py-1.5 space-y-0.5 max-h-28 overflow-y-auto">
                  {logs.length > 0 ? (
                    logs.map((log, i) => (
                      <div key={i} className="flex items-center gap-1 text-ice-2xs font-mono">
                        <span
                          className={`shrink-0 ${
                            log.status === 'completed'
                              ? 'text-emerald-500'
                              : log.status === 'failed'
                                ? 'text-red-400'
                                : 'text-blue-400'
                          }`}
                        >
                          {log.status === 'completed' ? '\u2713' : log.status === 'failed' ? '\u2717' : '\u25CF'}
                        </span>
                        <span className={log.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>
                          {log.message}
                        </span>
                        {log.duration_ms != null && (
                          <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-ice-2xs font-mono text-slate-500">No logs recorded</div>
                  )}
                  {ev.error && (
                    <div className="text-ice-2xs font-mono text-red-400 pt-1 border-t border-slate-800">{ev.error}</div>
                  )}
                  {ev.duration_seconds != null && (
                    <div className="text-ice-2xs font-mono text-slate-500 pt-0.5">
                      {ev.duration_seconds < 60
                        ? `${ev.duration_seconds}s`
                        : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                    </div>
                  )}
                  {ev.status === 'failed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        import('../../../shared/api/api-adapter').then(({ getApi }) => {
                          getApi()
                            .pipeline.retryDeploy(ev.id)
                            .then(() => {
                              // Refresh events for the relevant service nodes
                              for (const svc of connectedServices) {
                                dispatch(fetchEventsForNode({ cardId, nodeId: svc.id }));
                              }
                            });
                        });
                      }}
                      className="mt-1 px-2 py-0.5 text-ice-2xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

// ─── Env Vars Editor ────────────────────────────────────────────────────────

const EnvVarsEditor: React.FC<{
  variables: Array<{ name: string; value: string; isSecret?: boolean }>;
  onChange: (vars: Array<{ name: string; value: string; isSecret?: boolean }>) => void;
}> = ({ variables, onChange }) => {
  const handleAdd = () => {
    onChange([...variables, { name: '', value: '', isSecret: false }]);
  };

  const handleRemove = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, field: 'name' | 'value' | 'isSecret', val: unknown) => {
    const updated = variables.map((v, i) => (i === index ? { ...v, [field]: val } : v));
    onChange(updated);
  };

  return (
    <Section title={t('properties.envVars.title')}>
      <div className="space-y-1.5">
        {variables.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={v.name}
              onChange={(e) => handleUpdate(i, 'name', e.target.value)}
              placeholder={t('properties.envVars.keyPlaceholder')}
              className="flex-1 min-w-0 px-1.5 py-1 text-ice-xs font-mono rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-ice-text-3 text-ice-xs">=</span>
            <input
              value={v.isSecret ? '••••••' : v.value}
              onChange={(e) => handleUpdate(i, 'value', e.target.value)}
              placeholder={t('properties.envVars.valuePlaceholder')}
              type={v.isSecret ? 'password' : 'text'}
              className="flex-1 min-w-0 px-1.5 py-1 text-ice-xs font-mono rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => handleUpdate(i, 'isSecret', !v.isSecret)}
              className={`p-0.5 rounded text-ice-xs transition-colors ${v.isSecret ? 'text-amber-500' : 'text-ice-text-3 hover:text-ice-text-2'}`}
              title={v.isSecret ? t('properties.envVars.secretTitle') : t('properties.envVars.makeSecretTitle')}
            >
              {v.isSecret ? '🔒' : '🔓'}
            </button>
            <button
              onClick={() => handleRemove(i)}
              className="p-0.5 text-ice-text-3 hover:text-red-400 transition-colors"
            >
              &times;
            </button>
          </div>
        ))}
        <button onClick={handleAdd} className="text-ice-xs text-ice-text-3 hover:text-blue-400 transition-colors">
          {t('properties.envVars.addVariable')}
        </button>
      </div>
    </Section>
  );
};

