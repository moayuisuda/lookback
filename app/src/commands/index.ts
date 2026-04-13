import React from "react";
import { canvasActions, canvasState } from "../store/canvasStore";
import { globalActions, globalState } from "../store/globalStore";
import { commandActions, commandState } from "../store/commandStore";
import { i18nState } from "../store/i18nStore";
import type { CommandContext, CommandDefinition } from "./types";
import { API_BASE_URL } from "../config";
import { useEnvState } from "../hooks/useEnvState";
import { useT } from "../i18n/useT";
import { shellApi } from "../service";

export const getCommandContext = (): CommandContext => ({
  React,
  hooks: {
    useEnvState,
    useT,
  },
  actions: {
    canvasActions,
    globalActions,
    commandActions,
  },
  store: {
    canvas: canvasState,
    global: globalState,
    command: commandState,
    i18n: i18nState,
  },
  config: {
    API_BASE_URL,
  },
  shell: shellApi,
  components: {},
});

export const getCommands = (): CommandDefinition[] => [
  ...commandState.externalCommands,
];
