/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** '1' in development only: answer with labelled demo responses instead of calling Claude. */
  readonly VITE_HOOSHVARE_MOCK?: string;
}
