export const CANVAS_TEXT_LINE_HEIGHT = 1.2;

export const getCanvasTextLines = (text: string) => text.split("\n");

export const normalizePastedCanvasText = (text: string) =>
  text.replace(/\r\n?/g, "\n");
