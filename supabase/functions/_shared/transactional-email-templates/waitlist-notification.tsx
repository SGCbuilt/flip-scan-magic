import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

/**
 * waitlist-notification — internal alert to the site owner when someone
 * submits the coming-soon waitlist form. Fixed recipient: info@sgcflip.com.
 */
interface Props {
  fullName?: string
  email?: string
  phone?: string
  markets?: string
  motion?: string
  company?: string
  message?: string
  submittedAt?: string
}

const Row = ({ label, value }: { label: string; value?: string }) => (
  <Text style={row}>
    <span style={rowLabel}>{label}: </span>
    <span style={rowValue}>{value && value.trim() ? value : '(not provided)'}</span>
  </Text>
)

const Email = ({ fullName = '', email = '', phone = '', markets = '', motion = '', company = '', message = '', submittedAt = '' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New FlipScan Pro waitlist signup — ${fullName || email}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section>
          <Text style={heading}>New waitlist signup</Text>
          <Text style={sub}>FlipScan Pro coming-soon page{submittedAt ? ` · ${submittedAt}` : ''}</Text>
        </Section>
        <Hr style={hr} />
        <Section>
          <Row label="Full name" value={fullName} />
          <Row label="Email" value={email} />
          <Row label="Phone" value={phone} />
          <Row label="Market(s)" value={markets} />
          <Row label="Motion" value={motion} />
          <Row label="Company" value={company} />
        </Section>
        {message && message.trim() ? (
          <>
            <Hr style={hr} />
            <Section>
              <Text style={rowLabel}>Message:</Text>
              <Text style={messageStyle}>{message}</Text>
            </Section>
          </>
        ) : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `FlipScan Pro waitlist — ${(d?.fullName || d?.email || 'new signup')} (${d?.motion || 'motion n/a'})`,
  displayName: 'Waitlist signup notification',
  to: 'info@sgcflip.com',
  previewData: {
    fullName: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '+1 (555) 000-0000',
    markets: 'Memphis, Atlanta',
    motion: 'both',
    company: 'Rivera Capital',
    message: 'Looking for heavy rehab deals under $200k.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '24px 24px 32px', maxWidth: '560px' }
const heading = { fontSize: '18px', fontWeight: 700, color: '#0F2460', margin: '0 0 4px' }
const sub = { fontSize: '13px', color: '#475569', margin: '0' }
const hr = { borderColor: '#E5E9F0', margin: '16px 0' }
const row = { fontSize: '14px', margin: '0 0 8px' }
const rowLabel = { color: '#475569', fontSize: '13px' }
const rowValue = { color: '#111827', fontSize: '14px', fontWeight: 600 }
const messageStyle = { fontSize: '14px', color: '#1F2937', lineHeight: '1.6', margin: '6px 0 0', whiteSpace: 'pre-wrap' as const }
