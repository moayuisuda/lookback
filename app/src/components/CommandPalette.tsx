import React, { useEffect, useMemo, useRef } from 'react';
import { useSnapshot } from 'valtio';
import { useT } from '../i18n/useT';
import { commandActions, commandState } from '../store/commandStore';
import { canvasState, type CanvasText } from '../store/canvasStore';
import { getCommandContext, getCommands } from '../commands';
import type {
  CommandContext,
  CommandDefinition,
} from '../commands/types';
import { emitContainCanvasItem } from '../events/uiEvents';
import { useClickOutside } from '../hooks/useClickOutside';
import { clsx } from 'clsx';
import type { I18nKey } from '../../shared/i18n/types';

type CommandResult = {
  kind: 'command';
  command: CommandDefinition;
};

type TextResult = {
  kind: 'text';
  item: CanvasText;
};

type ImageResult = {
  kind: 'image';
  item: never;
  distance?: number;
};

type SearchResult = CommandResult | TextResult | ImageResult;

const normalizeQuery = (value: string) => value.trim().toLowerCase();
const getCommandTitle = (
  command: CommandDefinition,
  t: (key: I18nKey) => string,
) => {
  if (command.titleKey) return t(command.titleKey);
  if (command.title) return command.title;
  return command.id;
};

const getCommandDescription = (
  command: CommandDefinition,
  t: (key: I18nKey) => string,
) => {
  if (command.descriptionKey) return t(command.descriptionKey);
  if (command.description) return command.description;
  return '';
};

const isUiComponent = (
  ui: CommandDefinition['ui'],
): ui is React.FC<{ context: CommandContext }> => {
  return typeof ui === 'function' || (typeof ui === 'object' && ui !== null);
};

export const CommandPalette: React.FC = () => {
  const snap = useSnapshot(commandState);
  const canvasSnap = useSnapshot(canvasState);
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  void snap.externalCommands;

  useClickOutside(panelRef, () => {
    if (snap.isOpen) commandActions.close();
  });

  useEffect(() => {
    if (!snap.isOpen) return;
    void commandActions.loadExternalCommands();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [snap.isOpen]);

  const commands = getCommands();
  const commandContext = getCommandContext();
  const query = normalizeQuery(snap.query);

  const commandResults = useMemo<CommandResult[]>(() => {
    if (!query) {
      return commands.map((command) => ({ kind: 'command', command }));
    }
    return commands
      .filter((command) => {
        const title = normalizeQuery(getCommandTitle(command, t));
        const desc = normalizeQuery(getCommandDescription(command, t));
        const keywordHit = (command.keywords || []).some((k) =>
          normalizeQuery(k).includes(query),
        );
        return title.includes(query) || desc.includes(query) || keywordHit;
      })
      .map((command) => ({ kind: 'command', command }));
  }, [commands, query, t]);

  const textResults = useMemo<TextResult[]>(() => {
    if (!query) return [];
    return canvasSnap.canvasItems
      .filter((item): item is CanvasText => item.type === 'text')
      .filter((item) => normalizeQuery(item.text || '').includes(query))
      .map((item) => ({ kind: 'text', item }));
  }, [canvasSnap.canvasItems, query]);

  const results: SearchResult[] = [...commandResults, ...textResults];

  const activeCommand = commands.find(
    (command) => command.id === snap.activeCommandId,
  );
  const activeUi = activeCommand?.ui;
  const isTaskUi = !!activeUi;

  const handleConfirmSelection = async (result?: SearchResult) => {
    const current = result ?? results[snap.selectedIndex];
    if (!current) return;
    if (current.kind === 'command') {
      const command = current.command;
      if (command.ui) {
        commandActions.setActiveCommand(command.id);
        return;
      }
      if (command.run) {
        await command.run(commandContext);
        commandActions.close();
        return;
      }
      return;
    }
    if (current.kind === 'text') {
      emitContainCanvasItem({ id: current.item.canvasId });
      commandActions.close();
      return;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement> | KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (snap.activeCommandId) {
        commandActions.setActiveCommand(null);
      } else {
        commandActions.close();
      }
      return;
    }
    
    // Only handle other keys if it's the input element
    if (!('target' in e) || (e.target as HTMLElement).tagName !== 'INPUT') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(results.length - 1, snap.selectedIndex + 1);
      commandActions.setSelectedIndex(Math.max(0, next));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(0, snap.selectedIndex - 1);
      commandActions.setSelectedIndex(next);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleConfirmSelection();
      return;
    }
  };

  useEffect(() => {
    if (!snap.isOpen) return;
    if (!isTaskUi) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (snap.activeCommandId) {
          commandActions.setActiveCommand(null);
        } else {
          commandActions.close();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [snap.isOpen, isTaskUi]);

  if (!snap.isOpen) return null;

  return (
    <div className="absolute inset-0 z-[9998] flex items-start justify-center bg-black/40 backdrop-blur-sm no-drag">
      <div
        ref={panelRef}
        className="mt-24 w-[640px] rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-2xl overflow-hidden"
      >
        {isTaskUi ? (
          <>
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <span className="font-medium text-sm text-neutral-200">
                {activeCommand ? getCommandTitle(activeCommand, t) : ''}
              </span>
              <button
                type="button"
                onClick={() => commandActions.setActiveCommand(null)}
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                {t('commandPalette.back')}
              </button>
            </div>
            {isUiComponent(activeUi) ? (
              <div className="max-h-[500px] overflow-y-auto">
                {React.createElement(activeUi, {
                  context: commandContext,
                })}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
              <input
                ref={inputRef}
                value={snap.query}
                onChange={(e) => commandActions.setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('commandPalette.placeholder')}
                className="flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
              />
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {results.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-neutral-500">
                  {t('commandPalette.empty')}
                </div>
              )}
              {results.map((result, index) => {
                const isActive = index === snap.selectedIndex;
                if (result.kind === 'command') {
                  return (
                    <button
                      key={result.command.id}
                      type="button"
                      onMouseEnter={() => commandActions.setSelectedIndex(index)}
                      onClick={() => void handleConfirmSelection(result)}
                      className={clsx(
                        'w-full px-4 py-3 text-left flex items-center justify-between gap-4 text-sm transition-colors',
                        isActive ? 'bg-neutral-800/70 text-white' : 'text-neutral-200',
                      )}
                    >
                      <div>
                        <div className="font-medium">
                          {getCommandTitle(result.command, t)}
                        </div>
                        {getCommandDescription(result.command, t) && (
                          <div className="text-xs text-neutral-500">
                            {getCommandDescription(result.command, t)}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] uppercase text-neutral-500">
                        {t('commandPalette.commandLabel')}
                      </span>
                    </button>
                  );
                }
                if (result.kind === 'text') {
                  return (
                    <button
                      key={result.item.canvasId}
                      type="button"
                      onMouseEnter={() => commandActions.setSelectedIndex(index)}
                      onClick={() => void handleConfirmSelection(result)}
                      className={clsx(
                        'w-full px-4 py-3 text-left flex items-center justify-between gap-4 text-sm transition-colors',
                        isActive ? 'bg-neutral-800/70 text-white' : 'text-neutral-200',
                      )}
                    >
                      <div className="truncate">
                        {result.item.text || ''}
                      </div>
                      <span className="text-[10px] uppercase text-neutral-500">
                        {t('commandPalette.textLabel')}
                      </span>
                    </button>
                  );
                }
                return null;
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
