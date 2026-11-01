/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** Full URL of the Hooshvare HTTPS function, e.g. https://REGION-PROJECT.cloudfunctions.net/hooshvare */
  readonly VITE_HOOSHVARE_URL?: string;
}
