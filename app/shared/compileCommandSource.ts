import { transform } from "sucrase";

export type CompileCommandRequest = {
  id: number;
  source: string;
  filePath: string;
};

export type CompileCommandResponse = {
  id: number;
  code?: string;
  error?: string;
};

const rewriteImportExtensions = (code: string) =>
  code.replace(
    /((?:from\s*|import\s*(?:\(\s*)?)["'])(\.{1,2}\/[^"'()]+?)\.(jsx|mjs|tsx|ts)(["'])/g,
    "$1$2.js$4",
  );

const hasReactBinding = (code: string) =>
  /\bimport\s+React\b/.test(code) ||
  /\bimport\s+\*\s+as\s+React\b/.test(code) ||
  /\b(?:const|let|var|function|class)\s+React\b/.test(code);

const injectReactGlobal = (code: string) =>
  hasReactBinding(code) ? code : `const React = globalThis.React;\n${code}`;

export const compileCommandSource = (source: string, filePath: string): string => {
  const ext = /\.[^.\\/]+$/.exec(filePath)?.[0].toLowerCase();
  const transforms: Array<"jsx" | "typescript"> = [];
  if (ext === ".jsx" || ext === ".tsx") transforms.push("jsx");
  if (ext === ".ts" || ext === ".tsx") transforms.push("typescript");
  const compiled = transforms.length > 0
    ? transform(source, { transforms, production: true }).code
    : source;
  return injectReactGlobal(rewriteImportExtensions(compiled));
};
