import React from 'react';
import { useSnapshot } from 'valtio';
import { canvasActions, canvasState, getRenderBbox } from '../store/canvasStore';
import { globalActions, globalState } from '../store/globalStore';
import { commandActions, commandState } from '../store/commandStore';
import type { CommandContext, CommandDefinition } from './types';
import { emitContainCanvasItem } from '../events/uiEvents';
import { API_BASE_URL } from '../config';

export const getCommandContext = (): CommandContext => ({
  React,
  hooks: {
    useSnapshot,
  },
  state: {
    canvasState,
    globalState,
    commandState,
  },
  actions: {
    canvasActions,
    globalActions,
    commandActions,
    emitContainCanvasItem,
  },
  utils: {
    getRenderBbox,
  },
  config: {
    API_BASE_URL,
  },
  components: {},
});

export const getCommands = (): CommandDefinition[] => [
  ...commandState.externalCommands,
];
