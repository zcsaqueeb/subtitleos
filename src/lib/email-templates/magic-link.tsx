import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your login link</Heading>
        <Text style={text}>Use the button below to securely log in to {siteName}.</Text>
        <Button style={button} href={confirmationUrl}>
          Log in to SubtitleOS
        </Button>
        <Text style={smallText}>If the button does not open, copy and paste this link into your browser:</Text>
        <Text style={urlText}>{confirmationUrl}</Text>
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#d8b45a',
  color: '#111111',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
  fontWeight: 'bold' as const,
}
const smallText = { fontSize: '12px', color: '#777777', lineHeight: '1.5', margin: '24px 0 6px' }
const urlText = { fontSize: '12px', color: '#333333', lineHeight: '1.5', wordBreak: 'break-all' as const, margin: '0 0 22px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
