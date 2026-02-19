import type { I18nKey } from "../../shared/i18n/types";
import { globalActions } from "../store/globalStore";
import { commandActions } from "../store/commandStore";

export const importExternalCommand = async (
  t: (key: I18nKey) => string,
) => {
  try {
    if (!window.electron?.importCommand) {
      globalActions.pushToast(
        {
          key: "toast.importFailed",
          params: { error: t("commandPalette.importUnavailable") },
        },
        "error",
      );
      return;
    }
    const result = await window.electron.importCommand();
    if (result.success) {
      globalActions.pushToast({ key: "toast.importSuccess" }, "success");
      await commandActions.loadExternalCommands();
      return;
    }
    if (result.error) {
      if (result.partialSuccess) {
        await commandActions.loadExternalCommands();
      }
      globalActions.pushToast(
        { key: "toast.importFailed", params: { error: result.error } },
        "error",
      );
    }
  } catch (error) {
    globalActions.pushToast(
      {
        key: "toast.importFailed",
        params: { error: error instanceof Error ? error.message : String(error) },
      },
      "error",
    );
  }
};
