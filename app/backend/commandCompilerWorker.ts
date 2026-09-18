import { parentPort } from "node:worker_threads";
import {
  compileCommandSource,
  type CompileCommandRequest,
  type CompileCommandResponse,
} from "../shared/compileCommandSource";

parentPort!.on("message", ({ id, source, filePath }: CompileCommandRequest) => {
  let response: CompileCommandResponse;
  try {
    response = { id, code: compileCommandSource(source, filePath) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }
  parentPort!.postMessage(response);
});
