import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const noop = () => {};

/** Sağlayıcı yoksa (ör. test) sessizce hiçbir şey yapmaz. */
export const ToastContext = createContext<ToastApi>({ success: noop, error: noop, info: noop });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
