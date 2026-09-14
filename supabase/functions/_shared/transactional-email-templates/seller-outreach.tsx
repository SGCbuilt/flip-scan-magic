import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

/**
 * seller-outreach — wraps AI-generated subject/body in the standard shell.
 * Sent through send-transactional-email, so the suppression check and the
 * unsubscribe token/footer applied to every other template apply here too.
 */
interface Props {
  subject?: string
  body?: string
  signature?: string
}

const DEFAULT_SIGNATURE =
  'Albert Salomon\nSGC General Contractors\n(703) 944-9770 · projects@sgcbuilt.com'

const Email = ({ body = '', signature = DEFAULT_SIGNATURE, subject = '' }: Props) => {
  const paragraphs = String(body).split(/\n{2,}/).filter(Boolean)
  const sigLines = String(signature).split('\n').filter(Boolean)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject || 'A note about your property'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            {paragraphs.map((p, i) => (
              <Text key={i} style={para}>
                {p.split('\n').map((line, j) => (
                  <React.Fragment key={j}>{j > 0 ? <br /> : null}{line}</React.Fragment>
                ))}
              </Text>
            ))}
          </Section>
          <Hr style={hr} />
          <Section>
            {sigLines.map((line, i) => (
              <Text key={i} style={i === 0 ? sigName : sig}>{line}</Text>
            ))}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    (typeof d?.subject === 'string' && d.subject.trim()) || 'A note about your property',
  displayName: 'Seller outreach (AI-written)',
  previewData: {
    subject: 'About your property on Main St',
    body: "Hi Dana,\n\nI'm a local contractor in Pittsboro. I saw the sale date posted on your Main St property for October 2nd.\n\nIf a straightforward cash sale before that date would help, I can put a number in front of you this week. If not, no problem at all — I won't keep writing.",
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '24px 24px 32px', maxWidth: '560px' }
const para = { fontSize: '15px', color: '#1F2937', lineHeight: '1.6', margin: '0 0 14px' }
const hr = { borderColor: '#E5E9F0', margin: '18px 0 12px' }
const sigName = { fontSize: '14px', fontWeight: 700, color: '#0F2460', margin: '0' }
const sig = { fontSize: '13px', color: '#475569', margin: '0' }
