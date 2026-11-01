/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** '1' in development only: answer with labelled demo responses instead of calling Claude. */
  readonly VITE_HOOSHVARE_MOCK?: string;
}
