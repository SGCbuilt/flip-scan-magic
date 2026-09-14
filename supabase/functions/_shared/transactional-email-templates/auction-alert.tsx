import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AuctionItem {
  address?: string
  city?: string
  state?: string
  auctionDateLabel?: string
  daysOut?: number | null
  auctionType?: string
  openingBid?: number
  estimatedValue?: number
  grade?: string
  sourceUrl?: string
  sourceLabel?: string
}

interface Props {
  areaLabel?: string
  records?: AuctionItem[]
  scannedAt?: string
  appUrl?: string
}

const usd = (n?: number) =>
  n && n > 0 ? '$' + Math.round(n).toLocaleString('en-US') : '—'

const Email = ({ areaLabel = 'your watch area', records = [], scannedAt = '', appUrl = 'https://sgcflip.com' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${records.length} new auction listing${records.length === 1 ? '' : 's'} in ${areaLabel}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>SGC BUILT · FlipScan Pro</Text>
          <Heading style={h1}>
            {records.length} new auction listing{records.length === 1 ? '' : 's'}
          </Heading>
          <Text style={sub}>{areaLabel}{scannedAt ? ` · scanned ${scannedAt}` : ''}</Text>
        </Section>

        {records.map((r, i) => (
          <Section key={i} style={card}>
            <Text style={addr}>{r.address}</Text>
            <Text style={meta}>
              {[r.city, r.state].filter(Boolean).join(', ')}
              {r.auctionType ? ` · ${r.auctionType}` : ''}
              {r.grade ? ` · Grade ${r.grade}` : ''}
            </Text>
            <Text style={meta}>
              Sale date: <b>{r.auctionDateLabel || 'not scheduled'}</b>
              {typeof r.daysOut === 'number' ? ` (${r.daysOut} day${r.daysOut === 1 ? '' : 's'} out)` : ''}
            </Text>
            <Text style={meta}>
              Opening bid: {usd(r.openingBid)} · Est. value: {usd(r.estimatedValue)}
            </Text>
            {r.sourceUrl ? (
              <Text style={meta}>
                <Link href={r.sourceUrl} style={link}>
                  Open official notice{r.sourceLabel ? ` (${r.sourceLabel})` : ''} →
                </Link>
              </Text>
            ) : null}
          </Section>
        ))}

        <Hr style={hr} />
        <Text style={meta}>
          <Link href={appUrl} style={link}>Open Auction Radar in FlipScan Pro →</Link>
        </Text>
        <Text style={footer}>
          SGC General Contractors · Only newly detected listings are included; properties already
          reported for this watch are skipped.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const n = Array.isArray(d?.records) ? d.records.length : 0
    const area = d?.areaLabel || 'your watch area'
    return `⚖️ ${n} new auction listing${n === 1 ? '' : 's'} — ${area}`
  },
  displayName: 'Auction Radar alert',
  previewData: {
    areaLabel: 'Chatham County, NC',
    scannedAt: 'Sep 14, 2026',
    records: [{
      address: '123 Main St', city: 'Pittsboro', state: 'NC',
      auctionDateLabel: 'Oct 2, 2026', daysOut: 18, auctionType: 'Trustee Sale',
      openingBid: 142000, estimatedValue: 265000, grade: 'A',
      sourceUrl: 'https://example.gov/notice', sourceLabel: 'County notice',
    }],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '24px 24px 32px', maxWidth: '640px' }
const header = { paddingBottom: '8px' }
const brand = { fontSize: '12px', fontWeight: 700, color: '#1B3A8C', letterSpacing: '1px', margin: '0 0 6px' }
const h1 = { fontSize: '22px', color: '#0F2460', margin: '0 0 4px' }
const sub = { fontSize: '13px', color: '#64748B', margin: '0 0 16px' }
const card = { border: '1px solid #E5E9F0', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }
const addr = { fontSize: '15px', fontWeight: 700, color: '#0F2460', margin: '0 0 4px' }
const meta = { fontSize: '13px', color: '#475569', margin: '0 0 4px' }
const link = { color: '#1B3A8C', fontWeight: 700 }
const hr = { borderColor: '#E5E9F0', margin: '20px 0 12px' }
const footer = { fontSize: '11px', color: '#94A3B8', lineHeight: '1.6' }
