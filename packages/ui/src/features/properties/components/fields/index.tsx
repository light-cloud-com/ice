/**
 * Field primitives shared across the properties panel sections.
 *
 * Each is a small `React.FC` with a label + a single input. They are
 * exported from one file (not a barrel re-export — the no-barrel rule
 * applies to package-level `index.ts` files, not co-located primitives
 * grouped behind a folder).
 *
 * Members:
 *   Section          — title + children wrapper
 *   TextField        — label + <input type="text">
 *   NumberField      — label + <input type="number">
 *   SelectField      — label + <IceSelect> dropdown
 *   ListField        — label + add/remove list of strings
 *   QueueListField   — label + add/remove list of QueueSpec items
 *   StepperField     — label + +/- buttons with min/max bounds
 *   PropertyLabel    — label + optional tooltip popover
 *   CustomValueInput — config-driven type/min/max/unit input
 *
 * Extracted from `properties-panel.tsx` lines 296-553 in rf-props-6.
 */

import { Clock, Info, List } from 'lucide-react';
import React from 'react';
import { useSelector } from 'react-redux';
import { t } from '../../../../i18n';
import { IceSelect, type IceSelectOption } from '../../../../shared/components/ui/ice-select';
import { cn } from '../../../../shared/utils/cn';
import { selectActiveCard } from '../../../../store/slices/cards-slice';
import { type QueueSpec, parseQueue, stringifyQueue } from '../../utils/queue-spec';
import { type TaskSpec, emptyTask, parseTask, stringifyTask } from '../../utils/task-spec';
import type { CustomInputConfig } from './render-property-field';

// Re-export so existing consumers (`from './fields'` / `from '../index'`) keep
// resolving the type — canonical home stays in `./render-property-field`.
export type { CustomInputConfig };

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="pt-3 pb-2 px-3">
    {title && <div className="text-ice-2xs font-medium tracking-wide text-ice-text-3/50 mb-2">{title}</div>}
    <div className="space-y-1">{children}</div>
  </div>
);

// ─── Field components ───────────────────────────────────────────────────────

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  propKey?: string;
}> = ({ label, value, onChange, placeholder, propKey }) => (
  <div className="flex items-center justify-between gap-2 py-1" data-prop-key={propKey}>
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-prop-key={propKey}
      className="w-[140px] bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
    />
  </div>
);

export const NumberField: React.FC<{
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  propKey?: string;
}> = ({ label, value, onChange, propKey }) => (
  <div className="flex items-center justify-between gap-2 py-1" data-prop-key={propKey}>
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      data-prop-key={propKey}
      className="w-[140px] bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors"
    />
  </div>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  propKey?: string;
}> = ({ label, value, options, onChange, propKey }) => (
  <div className="flex items-center justify-between gap-2 py-1" data-prop-key={propKey}>
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <IceSelect value={value} onChange={onChange} options={options} width="140px" />
  </div>
);

export const ListField: React.FC<{
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
        + {addLabel || t('properties.addItem')}
      </button>
    </div>
  </div>
);

export const QueueListField: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}> = ({ label, value, onChange, placeholder, addLabel }) => {
  const queues = value.map(parseQueue);
  const update = (i: number, next: QueueSpec) => {
    const arr = [...value];
    arr[i] = stringifyQueue(next);
    onChange(arr);
  };
  return (
    <div className="py-1 space-y-2">
      <span className="text-ice-xs text-ice-text-3">{label}</span>
      <div className="space-y-1.5">
        {queues.map((q, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-ice-border/40 bg-ice-bg-raised/40 hover:border-ice-accent/40 transition-colors group"
          >
            {/* Queue icon */}
            <div
              className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(139,92,246,0.06))',
                border: '1px solid rgba(139,92,246,0.35)',
              }}
            >
              <List className="w-3 h-3 text-purple-300" />
            </div>
            {/* Name */}
            <input
              type="text"
              value={q.name}
              onChange={(e) => update(i, { ...q, name: e.target.value })}
              placeholder={placeholder || t('canvas.properties.fields.queueNamePlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-ice-xs text-ice-text-1 font-mono outline-none placeholder:text-ice-text-3/40"
            />
            {/* FIFO toggle */}
            <button
              onClick={() => update(i, { ...q, fifo: !q.fifo })}
              title={
                q.fifo
                  ? t('canvas.properties.fields.queueFifoTooltip')
                  : t('canvas.properties.fields.queueStandardTooltip')
              }
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-ice-2xs font-medium transition-colors"
              style={{
                background: q.fifo ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: q.fifo ? 'rgb(196,181,253)' : 'var(--ice-text-tertiary)',
                border: `1px solid ${q.fifo ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {q.fifo ? t('canvas.properties.fields.queueFifoBadge') : t('canvas.properties.fields.queueStandardBadge')}
            </button>
            {/* Remove */}
            <button
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="flex-shrink-0 p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-sm opacity-0 group-hover:opacity-100"
              title={t('canvas.properties.fields.queueRemoveTitle')}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...value, stringifyQueue({ name: '', fifo: false })])}
        className="w-full text-ice-2xs text-ice-text-3/60 hover:text-ice-accent transition-colors py-1.5 rounded border border-dashed border-ice-border/40 hover:border-ice-accent/40"
      >
        + {addLabel || t('canvas.properties.fields.queueAdd')}
      </button>
    </div>
  );
};

// ─── Cron task list ────────────────────────────────────────────────────────

// HTTP methods are universal API verbs — not translated.
const HTTP_METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const TaskListField: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  addLabel?: string;
  /** Id of the cron block being edited — excluded from the "Run a block"
   *  dropdown so a task can't fire its own block. */
  selfNodeId?: string;
}> = ({ label, value, onChange, addLabel, selfNodeId }) => {
  // Frequency options are computed per-render so locale changes propagate.
  const TASK_FREQUENCY_OPTIONS = [
    t('canvas.properties.fields.freqEvery5'),
    t('canvas.properties.fields.freqEvery15'),
    t('canvas.properties.fields.freqEvery30'),
    t('canvas.properties.fields.freqEveryHour'),
    t('canvas.properties.fields.freqEvery6h'),
    t('canvas.properties.fields.freqEvery12h'),
    t('canvas.properties.fields.freqDailyMidnight'),
    t('canvas.properties.fields.freqDaily9'),
    t('canvas.properties.fields.freqWeekdays9'),
    t('canvas.properties.fields.freqWeeklyMon'),
    t('canvas.properties.fields.freqMonthly1st'),
    t('canvas.properties.fields.freqCustom'),
  ];
  const ACTION_TYPE_OPTIONS: IceSelectOption[] = [
    {
      value: 'block',
      label: t('canvas.properties.fields.actionTypeBlockLabel'),
      description: t('canvas.properties.fields.actionTypeBlockDescription'),
    },
    {
      value: 'http',
      label: t('canvas.properties.fields.actionTypeHttpLabel'),
      description: t('canvas.properties.fields.actionTypeHttpDescription'),
    },
  ];
  const tasks = value.map(parseTask);
  // Block-target dropdown options for the "Run a block" action. Reads
  // through useSelector so renaming a target block elsewhere updates the
  // label live in the picker.
  const activeCard = useSelector(selectActiveCard);
  const blockOptions: IceSelectOption[] = React.useMemo(() => {
    if (!activeCard) return [];
    const nodes = (activeCard.nodes || []) as Array<{
      id: string;
      type?: string;
      data?: Record<string, unknown>;
    }>;
    return nodes
      .filter((n) => n.id !== selfNodeId && n.type !== 'container')
      .map((n) => {
        const data = (n.data || {}) as Record<string, unknown>;
        const labelStr = (data.name as string) || (data.label as string) || n.id;
        const iceType = (data.iceType as string) || '';
        const subtype = iceType.split('.').pop() || '';
        return {
          value: n.id,
          label: labelStr,
          description: subtype || undefined,
        };
      });
  }, [activeCard, selfNodeId]);
  const update = (i: number, next: TaskSpec) => {
    const arr = [...value];
    arr[i] = stringifyTask(next);
    onChange(arr);
  };
  return (
    <div className="py-1 space-y-2">
      <span className="text-ice-xs text-ice-text-3">{label}</span>
      <div className="space-y-1.5">
        {tasks.map((task, i) => {
          const isCustom = task.frequency === 'Custom' || task.frequency === 'Custom schedule';
          return (
            <div
              key={task.id || i}
              className="px-2 py-2 rounded-md border border-ice-border/40 bg-ice-bg-raised/40 hover:border-ice-accent/40 transition-colors group space-y-1.5"
            >
              {/* Top row — icon + name + remove */}
              <div className="flex items-center gap-2">
                <div
                  className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.06))',
                    border: '1px solid rgba(59,130,246,0.35)',
                  }}
                >
                  <Clock className="w-3 h-3 text-blue-300" />
                </div>
                <input
                  type="text"
                  value={task.name}
                  onChange={(e) => update(i, { ...task, name: e.target.value })}
                  placeholder={t('canvas.properties.fields.taskNamePlaceholder')}
                  className="flex-1 min-w-0 bg-transparent text-ice-xs text-ice-text-1 font-mono outline-none placeholder:text-ice-text-3/40"
                />
                <button
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="flex-shrink-0 p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-sm opacity-0 group-hover:opacity-100"
                  title={t('canvas.properties.fields.taskRemoveTitle')}
                >
                  &times;
                </button>
              </div>
              {/* Frequency row */}
              <div className="flex items-center gap-2 pl-8">
                <span className="text-ice-2xs text-ice-text-3/70 shrink-0 w-14">
                  {t('canvas.properties.fields.taskRowWhen')}
                </span>
                <IceSelect
                  value={task.frequency || t('canvas.properties.fields.freqDailyMidnight')}
                  onChange={(v) => update(i, { ...task, frequency: v })}
                  options={TASK_FREQUENCY_OPTIONS}
                  width="160px"
                  allowEmpty={false}
                />
              </div>
              {/* Custom cron row — only when frequency === 'Custom' */}
              {isCustom && (
                <div className="flex items-center gap-2 pl-8">
                  <span className="text-ice-2xs text-ice-text-3/70 shrink-0 w-14">
                    {t('canvas.properties.fields.taskRowCron')}
                  </span>
                  <input
                    type="text"
                    value={task.schedule_expression || ''}
                    onChange={(e) => update(i, { ...task, schedule_expression: e.target.value })}
                    placeholder={t('canvas.properties.fields.taskCronPlaceholder')}
                    className="flex-1 h-6 px-1.5 rounded text-ice-xs text-ice-text-1 font-mono bg-transparent border-b border-ice-border/50 hover:border-ice-text-3/50 focus:border-ice-accent outline-none transition-colors placeholder:text-ice-text-3/30"
                  />
                </div>
              )}
              {/* Action picker — what the task DOES when it fires. */}
              <div className="flex items-center gap-2 pl-8">
                <span className="text-ice-2xs text-ice-text-3/70 shrink-0 w-14">
                  {t('canvas.properties.fields.taskRowAction')}
                </span>
                <IceSelect
                  value={task.action_type || 'block'}
                  onChange={(v) => update(i, { ...task, action_type: v === 'http' ? 'http' : 'block' })}
                  options={ACTION_TYPE_OPTIONS}
                  width="160px"
                  allowEmpty={false}
                />
              </div>
              {/* Action target — depends on action_type. */}
              {(task.action_type || 'block') === 'block' ? (
                <div className="flex items-center gap-2 pl-8">
                  <span className="text-ice-2xs text-ice-text-3/70 shrink-0 w-14">
                    {t('canvas.properties.fields.taskRowBlock')}
                  </span>
                  <IceSelect
                    value={task.action_target_node_id || ''}
                    onChange={(v) => update(i, { ...task, action_target_node_id: v || undefined })}
                    options={blockOptions}
                    width="160px"
                    placeholder={
                      blockOptions.length === 0
                        ? t('canvas.properties.fields.taskNoBlocks')
                        : t('canvas.properties.fields.taskPickBlock')
                    }
                    emptyLabel={t('canvas.properties.fields.taskBlockNotSet')}
                    allowEmpty
                    disabled={blockOptions.length === 0}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 pl-8">
                    <span className="text-ice-2xs text-ice-text-3/70 shrink-0 w-14">
                      {t('canvas.properties.fields.taskRowUrl')}
                    </span>
                    <input
                      type="text"
                      value={task.action_url || ''}
                      onChange={(e) => update(i, { ...task, action_url: e.target.value })}
                      placeholder={t('canvas.properties.fields.taskUrlPlaceholder')}
                      className="flex-1 h-6 px-1.5 rounded text-ice-xs text-ice-text-1 font-mono bg-transparent border-b border-ice-border/50 hover:border-ice-text-3/50 focus:border-ice-accent outline-none transition-colors placeholder:text-ice-text-3/30"
                    />
                  </div>
                  <div className="flex items-center gap-2 pl-8">
                    <span className="text-ice-2xs text-ice-text-3/70 shrink-0 w-14">
                      {t('canvas.properties.fields.taskRowMethod')}
                    </span>
                    <IceSelect
                      value={task.action_http_method || 'GET'}
                      onChange={(v) => update(i, { ...task, action_http_method: v })}
                      options={HTTP_METHOD_OPTIONS}
                      width="160px"
                      allowEmpty={false}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => onChange([...value, stringifyTask(emptyTask())])}
        className="w-full text-ice-2xs text-ice-text-3/60 hover:text-ice-accent transition-colors py-1.5 rounded border border-dashed border-ice-border/40 hover:border-ice-accent/40"
      >
        + {addLabel || t('canvas.properties.fields.taskAdd')}
      </button>
    </div>
  );
};

export const StepperField: React.FC<{
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

// ─── Tooltip label ────────────────────────────────────────────────────────

export const PropertyLabel: React.FC<{ label: string; tooltip?: string }> = ({ label, tooltip }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  return (
    <span className="text-ice-xs text-ice-text-3 shrink-0 inline-flex items-center gap-1">
      {label}
      {tooltip && (
        <span
          className="relative inline-flex"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Info className="w-3 h-3 text-ice-text-3/30 hover:text-ice-text-3/60 cursor-help transition-colors" />
          {showTooltip && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-[9999] w-56 px-2 py-1.5 rounded text-ice-2xs leading-tight text-ice-text-2 bg-ice-overlay border border-ice-border shadow-lg pointer-events-none">
              {tooltip}
            </span>
          )}
        </span>
      )}
    </span>
  );
};

// ─── Custom value input (shown when 'custom' option is selected) ──────────

export const CustomValueInput: React.FC<{
  config: CustomInputConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ config, value, onChange }) => {
  const numVal = value != null ? String(value) : '';
  return (
    <div className="flex items-center gap-1.5 mt-1 ml-auto" style={{ width: '160px' }}>
      <input
        type={config.type}
        value={numVal}
        min={config.min}
        max={config.max}
        step={config.step}
        placeholder={config.placeholder}
        onChange={(e) => {
          const v = config.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value;
          onChange(v);
        }}
        className={cn(
          'flex-1 h-6 px-1.5 rounded text-ice-xs text-ice-text-1 bg-transparent',
          'border-b border-ice-border/50 hover:border-ice-text-3/50 focus:border-ice-accent',
          'outline-none transition-colors placeholder:text-ice-text-3/30',
        )}
      />
      <span className="text-ice-2xs text-ice-text-3/50 shrink-0">{config.unit}</span>
    </div>
  );
};
