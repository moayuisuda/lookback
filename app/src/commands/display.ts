import type { I18nKey } from "../../shared/i18n/types";
import type { CommandDefinition } from "./types";

export const getCommandTitle = (
  command: CommandDefinition,
  t: (key: I18nKey) => string,
) => {
  if (command.titleKey) return t(command.titleKey);
  if (command.title) return command.title;
  return command.id;
};

export const getCommandDescription = (
  command: CommandDefinition,
  t: (key: I18nKey) => string,
) => {
  if (command.descriptionKey) return t(command.descriptionKey);
  if (command.description) return command.description;
  return "";
};
