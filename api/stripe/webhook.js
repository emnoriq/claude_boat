// POST /api/stripe/webhook
// Stripe Webhookイベントを受信し、Supabaseのprofilesを更新
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: { bodyParser: false },
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const sb = getSupabase()

  if (!sb) {
    return res.status(500).json({ error: 'Supabase未設定' })
  }

  let event
  try {
    const rawBody = await getRawBody(req)
    const sig = req.headers['stripe-signature']
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message)
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  console.log(`[webhook] Event: ${event.type}`)

  const subscription = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = subscription
      const userId = session.metadata?.supabase_user_id
      if (userId && session.subscription) {
        await sb.from('profiles').update({
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          plan: 'premium',
          subscription_status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', userId)
      }
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const status = subscription.status
      const isActive = status === 'active' || status === 'trialing'

      // customer_idからprofileを見つけて更新
      const { data: profiles } = await sb
        .from('profiles')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .limit(1)

      if (profiles && profiles.length > 0) {
        await sb.from('profiles').update({
          plan: isActive ? 'premium' : 'free',
          subscription_status: status,
          updated_at: new Date().toISOString(),
        }).eq('id', profiles[0].id)
      }
      break
    }

    case 'invoice.payment_failed': {
      const customerId = subscription.customer
      const { data: profiles } = await sb
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .limit(1)

      if (profiles && profiles.length > 0) {
        await sb.from('profiles').update({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('id', profiles[0].id)
      }
      break
    }
  }

  res.status(200).json({ received: true })
}
