import type { ComponentType } from 'npm:react@18.3.1'
import { template as auctionAlert } from './auction-alert.tsx'
import { template as agentDigest } from './agent-digest.tsx'
import { template as sellerOutreach } from './seller-outreach.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'auction-alert': auctionAlert,
  'agent-digest': agentDigest,
  'seller-outreach': sellerOutreach,
}
