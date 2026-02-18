import { useSnapshot } from 'valtio';
import { globalState } from '../store/globalStore';
import { commandState } from '../store/commandStore';
import { canvasState } from '../store/canvasStore';
import { i18nState } from '../store/i18nStore';

export const useEnvState = () => {
  const global = useSnapshot(globalState);
  const command = useSnapshot(commandState);
  const canvas = useSnapshot(canvasState);
  const i18n = useSnapshot(i18nState);

  return {
    global,
    command,
    canvas,
    i18n,
  };
};
