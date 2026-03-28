import { useState } from 'react'
import { signIn, signUp } from '../lib/auth.js'

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signUpDone, setSignUpDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const data = await signIn(email, password)
        onAuth(data.session)
      } else {
        await signUp(email, password)
        setSignUpDone(true)
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'メールアドレスまたはパスワードが正しくありません'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  if (signUpDone) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">堅いレース.ai</h1>
          <div className="auth-success">
            <p>確認メールを送信しました</p>
            <p className="auth-hint">メール内のリンクをクリックしてから、ログインしてください。</p>
          </div>
          <button className="btn btn-primary auth-btn" onClick={() => { setSignUpDone(false); setMode('login') }}>
            ログイン画面へ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">堅いレース.ai</h1>
        <p className="auth-subtitle">今日一番当たりやすいレースを自動抽出</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            ログイン
          </button>
          <button
            className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
            onClick={() => { setMode('signup'); setError('') }}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@mail.com"
              required
            />
          </div>
          <div className="auth-field">
            <label>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="6文字以上"
              minLength={6}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary auth-btn" disabled={loading}>
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '新規登録'}
          </button>
        </form>
      </div>
    </div>
  )
}
