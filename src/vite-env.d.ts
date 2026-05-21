/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_RENTCAST_KEY?: string
  readonly VITE_ATTOM_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
