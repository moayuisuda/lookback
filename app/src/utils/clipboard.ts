const copyWithExecCommand = (text: string) => {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy command failed");
  }
};

export const writeTextToClipboard = async (text: string) => {
  const value = text.trim();
  if (!value) {
    throw new Error("Clipboard text is empty");
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Electron 环境下 clipboard API 可能存在但不可用，失败后继续回退。
    }
  }

  copyWithExecCommand(value);
};
