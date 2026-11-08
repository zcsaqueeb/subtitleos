import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  token,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} verification code{token ? `: ${token}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your verification code</Heading>
        <Text style={text}>
          Enter this code in {siteName} to finish creating your account for <strong>{recipient}</strong>.
        </Text>
        {token ? <Text style={codeBox}>{token}</Text> : null}
        <Text style={smallText}>This code expires in 60 minutes. If you didn't request it, you can ignore this email.</Text>
        <Text style={footer}>Requested on {siteUrl}.</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 25px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 20px' }
const smallText = { fontSize: '12px', color: '#777777', lineHeight: '1.5', margin: '20px 0 0' }
const codeBox = {
  display: 'inline-block',
  backgroundColor: '#f6f0dc',
  border: '1px solid #d8b45a',
  borderRadius: '8px',
  color: '#111111',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  padding: '16px 24px',
  margin: '0',
}
const footer = { fontSize: '12px', color: '#999999', margin: '28px 0 0' }
