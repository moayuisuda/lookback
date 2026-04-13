// This file is intended to be dynamically loaded.
// Imports are not allowed. Dependencies are passed via context.

export const config = {
  id: "openSelectedImageInFolder",
  i18n: {
    en: {
      "command.openSelectedImageInFolder.title": "Reveal Selected Image",
      "command.openSelectedImageInFolder.description": "Open selected image in system folder",
      "command.openSelectedImageInFolder.running": "Opening system folder...",
      "toast.command.openInFolder.noSelection": "Select one image first",
      "toast.command.openInFolder.unsupported": "Only local files can be opened in folder",
      "toast.command.openInFolder.failed": "Failed to open folder: {{error}}",
    },
    zh: {
      "command.openSelectedImageInFolder.title": "在文件夹中打开选中图片",
      "command.openSelectedImageInFolder.description": "在系统文件夹中定位当前选中图片",
      "command.openSelectedImageInFolder.running": "正在打开系统文件夹...",
      "toast.command.openInFolder.noSelection": "请先选中一张图片",
      "toast.command.openInFolder.unsupported": "仅支持本地文件路径",
      "toast.command.openInFolder.failed": "打开文件夹失败：{{error}}",
    },
  },
  titleKey: "command.openSelectedImageInFolder.title",
  title: "Reveal Selected Image",
  descriptionKey: "command.openSelectedImageInFolder.description",
  description: "Open selected image in system folder",
  keywords: ["open", "folder", "reveal", "image", "文件夹", "定位", "图片"],
};

const detectPlatform = () => {
  const raw = (navigator.platform || "").toLowerCase();
  if (raw.includes("mac")) return "mac";
  if (raw.includes("win")) return "win";
  if (raw.includes("linux")) return "linux";
  return "unknown";
};

const buildRevealCommand = (filePath, platform) => {
  if (platform === "mac") {
    return {
      command: "open",
      args: ["-R", filePath],
    };
  }
  if (platform === "win") {
    const safePath = String(filePath.replace(/\//g, "\\")).replace(/'/g, "''");
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-Command",
        `Start-Process explorer.exe -ArgumentList '/select,"${safePath}"'`,
      ],
    };
  }
  if (platform === "linux") {
    const dirname = filePath.substring(0, filePath.lastIndexOf("/")) || ".";
    return {
      command: "xdg-open",
      args: [dirname],
    };
  }
  return null;
};

const pickSelectedItem = (items) => {
  if (!Array.isArray(items)) return null;
  return items.find((item) => item && item.type === "image" && item.isSelected);
};

export const run = async (context, helpers) => {
  const { store, actions, shell } = context;
  const { toast } = helpers;
  const locale = store.i18n.locale || "en";
  const dict = config.i18n[locale] || config.i18n.en;

  const selectedItem = pickSelectedItem(store.canvas.canvasItems);
  if (!selectedItem || !selectedItem.imagePath) {
    toast(dict["toast.command.openInFolder.noSelection"]);
    actions.commandActions.close();
    return;
  }

  const { imagePath } = selectedItem;
  const { canvasActions, commandActions } = actions;

  if (canvasActions.isRemoteImagePath(imagePath)) {
    toast(dict["toast.command.openInFolder.unsupported"]);
    commandActions.close();
    return;
  }

  try {
    const resolvedPath = await canvasActions.resolveLocalImagePath(
      imagePath,
      store.canvas.currentCanvasName,
    );

    if (!resolvedPath) {
      throw new Error("Invalid target path");
    }

    const platform = detectPlatform();
    const revealTargetPath = platform === "linux" 
      ? canvasActions.getPathDirname(resolvedPath) 
      : resolvedPath;

    const command = buildRevealCommand(revealTargetPath, platform);
    if (!command) {
      toast(dict["toast.command.openInFolder.unsupported"]);
      commandActions.close();
      return;
    }

    const result = await shell(command);
    if (!result.success) {
      const errorMsg = result.error || result.stderr || "Unknown error";
      toast(dict["toast.command.openInFolder.failed"].replace("{{error}}", errorMsg));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast(dict["toast.command.openInFolder.failed"].replace("{{error}}", message));
  } finally {
    commandActions.close();
  }
};
