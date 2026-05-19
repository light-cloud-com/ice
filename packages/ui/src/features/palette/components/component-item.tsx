/**
 * Resource Palette — ComponentItem.
 *
 * Extracted verbatim from `resource-palette.tsx` (rf-rpal-5). The micro-card
 * with accent edge + optional runtime selector. Drag semantics are
 * load-bearing — preserved without any change in behavior:
 *
 *   - `application/ice-block` carries `component.type`.
 *   - `application/ice-block-name` carries `component.name`.
 *   - `application/ice-block-provider` carries the active provider filter.
 *   - `application/ice-block-data` carries a JSON blob of `description`
 *     plus optional `runtime` when a runtime chip is selected.
 *   - The DOM-built drag-image element gets a `border-left: 3px solid
 *     ${categoryColor}` accent and is removed via setTimeout(...,0).
 */

import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../shared/components/ui/tooltip';
import { cn } from '../../../shared/utils/cn';
import type { ComponentDef } from '../types';

interface ComponentItemProps {
  component: ComponentDef;
  selectedProvider: string;
  categoryColor: string;
  staggerIndex: number;
}

export const ComponentItem: React.FC<ComponentItemProps> = ({
  component,
  selectedProvider,
  categoryColor,
  staggerIndex,
}) => {
  const Icon = component.icon;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRuntime, setSelectedRuntime] = useState<string | null>(component.runtimes?.[0]?.value ?? null);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/ice-block', component.type);
    e.dataTransfer.setData('application/ice-block-name', component.name);
    e.dataTransfer.setData('application/ice-block-provider', selectedProvider);

    // Include selected runtime in drag data overrides
    const dataOverrides: Record<string, unknown> = {
      description: component.description,
    };
    if (selectedRuntime) {
      dataOverrides.runtime = selectedRuntime;
    }
    e.dataTransfer.setData('application/ice-block-data', JSON.stringify(dataOverrides));
    e.dataTransfer.effectAllowed = 'move';

    const runtimeLabel = selectedRuntime ? ` (${selectedRuntime})` : '';
    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 35, 0.95);
        color: #fff;
        border-radius: 10px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
        font-family: 'JetBrains Mono Variable', monospace;
        backdrop-filter: blur(20px);
        border-left: 3px solid ${categoryColor};
        letter-spacing: 0.02em;
      ">
        ${component.name}<span style="color: rgba(255,255,255,0.5); font-weight: 400; margin-left: 4px;">${runtimeLabel}</span>
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const hasRuntimes = component.runtimes && component.runtimes.length > 0;

  return (
    <div className="palette-item-enter" style={{ animationDelay: staggerIndex > 0 ? `${staggerIndex * 15}ms` : '0ms' }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              'group flex items-center py-0.5 pl-6 pr-2 cursor-grab',
              'hover:text-ice-text-1',
              'active:cursor-grabbing active:opacity-70',
              'transition-colors',
              isDragging && 'opacity-40',
            )}
            data-block-type={component.type}
            data-testid={`block-item-${component.type}`}
          >
            <Icon className="w-3 h-3 mr-2 shrink-0" style={{ color: `${categoryColor}80` }} />
            <span className="text-ice-xs text-ice-text-3 group-hover:text-ice-text-1 truncate transition-colors">
              {component.name}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="max-w-[240px] bg-ice-overlay border border-ice-border text-ice-sm leading-relaxed px-3 py-2 rounded-md shadow-lg"
        >
          <p className="font-medium text-ice-text-1 text-ice-base mb-1">{component.name}</p>
          <p className="text-ice-text-2">{component.description}</p>
          <div className="flex gap-1 mt-1.5">
            {component.providers.map((p) => (
              <span key={p} className="text-ice-2xs font-medium text-ice-text-3 uppercase">
                {p}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Runtime chips — shown below the drag row */}
      {hasRuntimes && (
        <div className="flex flex-wrap gap-1 pl-8 pr-2 mb-1 mt-0.5">
          {component.runtimes!.map((rt) => {
            const isSelected = selectedRuntime === rt.value;
            return (
              <button
                key={rt.value}
                onClick={() => setSelectedRuntime(rt.value)}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={cn(
                  'px-1.5 py-0.5 rounded text-ice-xs font-medium transition-all duration-150 cursor-grab',
                  'active:cursor-grabbing active:scale-95',
                  'border',
                  isSelected ? 'border-current' : 'border-transparent hover:bg-ice-hover',
                )}
                style={
                  isSelected
                    ? {
                        color: categoryColor,
                        backgroundColor: `${categoryColor}12`,
                        borderColor: `${categoryColor}30`,
                      }
                    : {
                        color: 'var(--ice-text-tertiary)',
                      }
                }
              >
                {rt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
