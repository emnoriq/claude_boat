// POST /api/stripe/portal
// Stripeカスタマーポータル（解約・カード変更用）
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function handler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sb = getSupabase()
  const userId = req.query.user_id

  if (!sb || !userId) {
    return res.status(400).json({ error: 'パラメータ不足' })
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (!profile?.stripe_customer_id) {
    return res.status(404).json({ error: 'Stripe顧客が見つかりません' })
  }

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://localhost:3000'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: origin,
  })

  if (req.method === 'GET') {
    return res.redirect(303, portalSession.url)
  }
  return res.status(200).json({ url: portalSession.url })
}
