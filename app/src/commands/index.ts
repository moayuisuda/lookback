import React from "react";
import { canvasActions } from "../store/canvasStore";
import { globalActions } from "../store/globalStore";
import { commandActions, commandState } from "../store/commandStore";
import type { CommandContext, CommandDefinition } from "./types";
import { API_BASE_URL } from "../config";
import { useEnvState } from "../hooks/useEnvState";
import { useT } from "../i18n/useT";

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
  config: {
    API_BASE_URL,
  },
  components: {},
});

export const getCommands = (): CommandDefinition[] => [
  ...commandState.externalCommands,
];
