// POST /api/stripe/checkout
// Stripeチェックアウトセッションを作成してリダイレクトURLを返す
import Stripe from 'stripe'

export default async function handler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const priceId = process.env.STRIPE_PRICE_ID

  if (!priceId) {
    return res.status(500).json({ error: 'STRIPE_PRICE_IDが未設定です' })
  }

  // GETリクエスト → チェックアウトページへリダイレクト
  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://localhost:3000'

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?payment=success`,
      cancel_url: `${origin}/?payment=cancel`,
      metadata: {
        supabase_user_id: req.query.user_id || '',
      },
    })

    // GETリクエストならリダイレクト、POSTならJSON
    if (req.method === 'GET') {
      return res.redirect(303, session.url)
    }
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[stripe/checkout] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
