import * as React from 'react'
import { render } from 'react-email'
import { parseEmailWebhookPayload } from '@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from '@lovable.dev/webhooks-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your SubtitleOS account',
  invite: "You've been invited",
  magiclink: 'Your SubtitleOS login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "SubtitleOS"
const SENDER_DOMAIN = "notify.subtitleos.com"
const FALLBACK_APP_ORIGIN = process.env.PUBLIC_APP_URL ?? process.env.SITE_URL ?? "https://subtitleos.lovable.app"
const FROM_DOMAIN = "notify.subtitleos.com"

type EmailPayloadData = Record<string, unknown> & {
  action_type?: string
  email?: string
  old_email?: string
  new_email?: string
  token?: string
  token_hash?: string
  tokenHash?: string
  url?: string
}

function readString(data: EmailPayloadData, key: keyof EmailPayloadData): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getAppOrigin(request: Request): string {
  const origin = new URL(request.url).origin
  return origin.includes('localhost') || origin.includes('127.0.0.1') ? FALLBACK_APP_ORIGIN : origin
}

function buildSafeActionUrl(data: EmailPayloadData, emailType: string, appOrigin: string): string {
  const tokenHash = readString(data, 'token_hash') ?? readString(data, 'tokenHash')
  const token = readString(data, 'token')
  const email = readString(data, 'email')

  if (emailType === 'recovery') {
    if (!tokenHash && !(token && email)) {
      return readString(data, 'url') ?? appOrigin
    }

    const recoveryUrl = new URL('/reset-password', appOrigin)
    if (tokenHash) recoveryUrl.searchParams.set('token_hash', tokenHash)
    if (token && email) {
      recoveryUrl.searchParams.set('token', token)
      recoveryUrl.searchParams.set('email', email)
    }
    recoveryUrl.searchParams.set('type', 'recovery')
    return recoveryUrl.toString()
  }

  const verificationUrl = new URL('/verify-email', appOrigin)
  if (tokenHash) verificationUrl.searchParams.set('token_hash', tokenHash)
  if (token && email) {
    verificationUrl.searchParams.set('token', token)
    verificationUrl.searchParams.set('email', email)
  }
  verificationUrl.searchParams.set('type', emailType === 'email_change' ? 'email_change' : emailType === 'magiclink' ? 'magiclink' : emailType === 'invite' ? 'invite' : 'signup')
  verificationUrl.searchParams.set('next', '/app')

  return tokenHash || (token && email) ? verificationUrl.toString() : readString(data, 'url') ?? appOrigin
}

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY

        if (!apiKey) {
          console.error('LOVABLE_API_KEY not configured')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any
        let run_id = ''
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          })
          payload = verified.payload
          run_id = payload.run_id
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case 'invalid_signature':
              case 'missing_timestamp':
              case 'invalid_timestamp':
              case 'stale_timestamp':
                console.error('Invalid webhook signature', { error: error.message })
                return Response.json(
                  { error: 'Invalid signature' },
                  { status: 401 }
                )
              case 'invalid_payload':
              case 'invalid_json':
                console.error('Invalid webhook payload', { error: error.message })
                return Response.json(
                  { error: 'Invalid webhook payload' },
                  { status: 400 }
                )
            }
          }

          console.error('Webhook verification failed', { error })
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (!run_id) {
          console.error('Webhook payload missing run_id')
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (payload.version !== '1') {
          console.error('Unsupported payload version', { version: payload.version, run_id })
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 }
          )
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const data = (payload.data ?? {}) as EmailPayloadData
        const emailType = readString(data, 'action_type')
        const appOrigin = getAppOrigin(request)
        console.log('Received auth event', {
          emailType,
          email_redacted: redactEmail(data.email),
          run_id,
        })

        if (!emailType) {
          console.error('Missing email action type', { run_id })
          return Response.json(
            { error: 'Missing email action type' },
            { status: 400 }
          )
        }

        const EmailTemplate = EMAIL_TEMPLATES[emailType]
        if (!EmailTemplate) {
          console.error('Unknown email type', { emailType, run_id })
          return Response.json(
            { error: `Unknown email type: ${emailType}` },
            { status: 400 }
          )
        }

        // Build template props from payload.data (HookData structure)
        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: appOrigin,
          recipient: data.email,
          confirmationUrl: buildSafeActionUrl(data, emailType, appOrigin),
          token: data.token,
          email: data.email,
          oldEmail: data.old_email,
          newEmail: data.new_email,
        }

        // Render React Email to HTML and plain text
        const element = React.createElement(EmailTemplate, templateProps)
        const html = await render(element)
        const text = await render(element, { plainText: true })

        // Enqueue email for async processing by the dispatcher (process-email-queue).
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error('Missing Supabase environment variables')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const messageId = crypto.randomUUID()

        // Log pending BEFORE enqueue so we have a record even if enqueue crashes
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: data.email,
          status: 'pending',
        })

        const { error: enqueueError } = await supabase.rpc('enqueue_email', {
          queue_name: 'auth_emails',
          payload: {
            run_id,
            message_id: messageId,
            to: data.email,
            from: `${SITE_NAME} <verify@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: EMAIL_SUBJECTS[emailType] || 'Notification',
            html,
            text,
            purpose: 'transactional',
            label: emailType,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          console.error('Failed to enqueue auth email', { error: enqueueError, run_id, emailType })
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: emailType,
            recipient_email: data.email,
            status: 'failed',
            error_message: 'Failed to enqueue email',
          })
          return Response.json(
            { error: 'Failed to enqueue email' },
            { status: 500 }
          )
        }

        console.log('Auth email enqueued', {
          emailType,
          email_redacted: redactEmail(data.email),
          run_id,
        })

        return Response.json({ success: true, queued: true })
      },
    },
  },
})
