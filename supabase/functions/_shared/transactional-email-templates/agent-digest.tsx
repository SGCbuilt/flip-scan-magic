import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AgentItem {
  address?: string
  city?: string
  state?: string
  grade?: string
  score?: number
  signal?: string
  autoAdded?: boolean
  sequenceStarted?: boolean
  sourceUrl?: string
}

interface Props {
  areaLabel?: string
  scannedAt?: string
  scanned?: number
  newCount?: number
  addedCount?: number
  records?: AgentItem[]
  appUrl?: string
}

const Email = ({
  areaLabel = 'your watch areas', scannedAt = '', scanned = 0,
  newCount = 0, addedCount = 0, records = [], appUrl = 'https://sgcflip.com',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${newCount} new lead${newCount === 1 ? '' : 's'} found · ${addedCount} auto-added to Pipeline`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section>
          <Text style={brand}>SGC BUILT · FlipScan Pro</Text>
          <Heading style={h1}>Research agent — daily run</Heading>
          <Text style={sub}>{areaLabel}{scannedAt ? ` · ${scannedAt}` : ''}</Text>
          <Text style={meta}>
            <b>{scanned}</b> records scanned · <b>{newCount}</b> new ·{' '}
            <b>{addedCount}</b> auto-added to Pipeline with follow-up running
          </Text>
        </Section>

        {records.map((r, i) => (
          <Section key={i} style={card}>
            <Text style={addr}>{r.address}</Text>
            <Text style={meta}>
              {[r.city, r.state].filter(Boolean).join(', ')}
              {r.grade ? ` · Grade ${r.grade}` : ''}
              {typeof r.score === 'number' ? ` (${r.score}/100)` : ''}
            </Text>
            {r.signal ? <Text style={meta}>{r.signal}</Text> : null}
            <Text style={meta}>
              {r.autoAdded ? '✓ Added to Pipeline' : 'Below threshold — not added'}
              {r.sequenceStarted ? ' · follow-up sequence started' : ''}
            </Text>
            {r.sourceUrl ? (
              <Text style={meta}><Link href={r.sourceUrl} style={link}>Open official source →</Link></Text>
            ) : null}
          </Section>
        ))}

        <Hr style={hr} />
        <Text style={meta}><Link href={appUrl} style={link}>Open FlipScan Pro →</Link></Text>
        <Text style={footer}>
          SGC General Contractors · This is a summary of work the agent already did.
          Calls, texts, voicemails and mail still wait for you in Drip Sequences.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const n = Number(d?.newCount || 0)
    const a = Number(d?.addedCount || 0)
    return `🤖 Research agent — ${n} new lead${n === 1 ? '' : 's'}, ${a} auto-added`
  },
  displayName: 'Research agent digest',
  previewData: {
    areaLabel: 'Chatham County, NC',
    scannedAt: 'Sep 15, 2026',
    scanned: 34, newCount: 3, addedCount: 2,
    records: [{
      address: '123 Main St', city: 'Pittsboro', state: 'NC',
      grade: 'A', score: 81, signal: 'Trustee Sale · sale 2026-10-02',
      autoAdded: true, sequenceStarted: true, sourceUrl: 'https://example.gov/notice',
    }],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '24px 24px 32px', maxWidth: '640px' }
const brand = { fontSize: '12px', fontWeight: 700, color: '#1B3A8C', letterSpacing: '1px', margin: '0 0 6px' }
const h1 = { fontSize: '22px', color: '#0F2460', margin: '0 0 4px' }
const sub = { fontSize: '13px', color: '#64748B', margin: '0 0 10px' }
const card = { border: '1px solid #E5E9F0', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }
const addr = { fontSize: '15px', fontWeight: 700, color: '#0F2460', margin: '0 0 4px' }
const meta = { fontSize: '13px', color: '#475569', margin: '0 0 4px' }
const link = { color: '#1B3A8C', fontWeight: 700 }
const hr = { borderColor: '#E5E9F0', margin: '20px 0 12px' }
const footer = { fontSize: '11px', color: '#94A3B8', lineHeight: '1.6' }
