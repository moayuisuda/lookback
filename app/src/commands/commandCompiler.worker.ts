import {
  compileCommandSource,
  type CompileCommandRequest,
  type CompileCommandResponse,
} from "../../shared/compileCommandSource";

self.onmessage = (event: MessageEvent<CompileCommandRequest>) => {
  const { id, source, filePath } = event.data;
  let response: CompileCommandResponse;
  try {
    response = { id, code: compileCommandSource(source, filePath) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
