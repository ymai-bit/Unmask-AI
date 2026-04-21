import { useState } from 'react'
import './App.css'

const TRUSTED_INGREDIENTS = [
  // Retinoids
  'retinol', 'retinal', 'retinaldehyde', 'adapalene', 'tretinoin', 'retinoic acid', 'retinoid',
  // Sunscreen
  'sunscreen', 'spf', 'zinc oxide', 'titanium dioxide', 'uva', 'uvb',
  // Niacinamide
  'niacinamide', 'nicotinamide',
  // Acne actives
  'salicylic acid', 'benzoyl peroxide', 'bha',
  // Vitamin C
  'vitamin c', 'ascorbic acid', 'l-ascorbic acid', 'ascorbyl',
  // Hyaluronic acid
  'hyaluronic acid', 'sodium hyaluronate',
]

const VERIFIED_PRODUCTS = [
  {
    match: /differin|adapalene.*gel|A-51346324/i,
    result: {
      score: 8,
      reasons: [
        'Contains adapalene, an OTC retinoid with decades of clinical research behind it',
        'One of the most studied and dermatologist-recommended acne treatments available',
        'Retinoids increase cell turnover and prevent clogged pores — a proven mechanism',
        'Backed by FDA approval and major dermatology guidelines',
        'Transparent ingredient list with no misleading or exaggerated claims',
      ],
    },
  },
  {
    match: /good molecules.*niacinamide|niacinamide.*face serum|A-89292990/i,
    result: {
      score: 12,
      reasons: [
        'Contains niacinamide, a well-studied ingredient for oil regulation',
        'Uses a lightweight serum format that supports absorption',
        'Claims (oil control, pore appearance) are realistic and supported',
        'Does not rely on exaggerated or instant-result promises',
      ],
    },
  },
  {
    match: /milk extract.*skincare.*set|milk.*5.piece|5.piece.*milk/i,
    result: {
      score: 70,
      reasons: [
        'Vague claims with no clinical specificity (e.g. "nourishes skin", "hydrating formula")',
        'Does not disclose ingredient concentrations despite listing active ingredients',
        'Sold as a bundle — per-product ingredient transparency is low',
        'Sourced from Temu, a platform with limited product verification standards',
        'Low brand transparency with no credible dermatological backing',
      ],
    },
  },
  {
    match: /n7.*night cream|n7.*facial.*neck|multi.effect.*facial.*neck/i,
    result: {
      score: 65,
      reasons: [
        'Uses vague marketing claims like "multi-effect", "firming", and "shaping" without clinical evidence',
        'Does not specify ingredient concentrations or formulation details',
        'Claims suitability for all skin types despite potentially heavy occlusive ingredients',
        'Unknown brand with limited transparency and no credible dermatological backing',
        'Contains hyaluronic acid — a positive signal, but insufficient to offset other concerns',
      ],
    },
  },
]

const RED_FLAGS = [
  'instant results',
  'permanent pore shrink',
  'overnight transformation',
  'clinically proven',
]

const POSITIVE_SIGNALS = [
  'niacinamide', 'salicylic acid', 'retinol', 'benzoyl peroxide',
]

const VAGUE_CLAIMS = [
  'multi-effect', 'firming', 'nourishing', 'revitalizing', 'rejuvenating',
  'shaping', 'suitable for all skin types', 'all skin types',
]

function applyLocalRules(parsed, productText) {
  const text = productText.toLowerCase()
  const hasStrongIngredients = TRUSTED_INGREDIENTS.some(i => text.includes(i))
  const hasPositiveSignals = POSITIVE_SIGNALS.some(i => text.includes(i))
  const noConcentrationInfo = !/(\d+\s*%|mg\b|ppm|concentration)/.test(text)
  const claimsAreVague = VAGUE_CLAIMS.some(c => text.includes(c))
  const isBundleProduct = /\b(set|bundle|kit|pack|\d+-piece)\b/.test(text)

  const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 20)
  const seen = new Set()
  let duplicates = 0
  for (const s of sentences) {
    if (seen.has(s)) duplicates++
    seen.add(s)
  }
  const reviewsAreRepetitive = duplicates >= 2

  let scamScore = parsed.score
  const extraReasons = []

  RED_FLAGS.forEach(flag => {
    if (text.includes(flag)) {
      if (flag === 'instant results' && !hasStrongIngredients) {
        scamScore += 40
        extraReasons.push('Claims "instant results" but lists no proven active ingredients')
      } else if (flag !== 'instant results') {
        scamScore += 20
        extraReasons.push(`Contains suspicious claim: "${flag}"`)
      }
    }
  })

  if (!hasStrongIngredients) {
    scamScore += 30
    extraReasons.push('No trusted evidence-based ingredients detected (e.g. retinol, niacinamide, salicylic acid)')
  }

  if (hasPositiveSignals) {
    scamScore -= 20
  }

  if (reviewsAreRepetitive) {
    scamScore += 25
    extraReasons.push('Reviews appear repetitive, which may indicate fake or coordinated feedback')
  }

  if (hasPositiveSignals && noConcentrationInfo) {
    scamScore += 20
    extraReasons.push('Mentions active ingredients without specifying concentrations or formulation details')
  }

  if (claimsAreVague) {
    scamScore += 15
    extraReasons.push('Uses vague or marketing-heavy claims with no clinical specificity')
  }

  if (isBundleProduct) {
    scamScore += 10
    extraReasons.push('Sold as a bundle or set — ingredient transparency is typically lower')
  }

  return {
    score: Math.min(100, Math.max(0, scamScore)),
    reasons: [...parsed.reasons, ...extraReasons],
  }
}

const PASTE_PROMPT = `You are an AI safety assistant that detects scam or misleading skincare products.

Analyze the product information and return ONLY a valid JSON object with:
1. Scam Risk Score (0-100)
2. Key Reasons (3-5 bullet points)

Use these criteria:
- Are the claims unrealistic or exaggerated?
- Do the ingredients support the claims?
- Are there signs of fake or AI-generated reviews?
- Does the brand seem untrustworthy or generic?
- Is there misleading "scientific" language?

Be skeptical and critical. Return ONLY this JSON format, no other text:
{
  "score": number,
  "reasons": ["...", "...", "..."]
}`

const SEARCH_PROMPT = `You are an AI safety assistant that detects scam or misleading skincare products.

The user will give you a product URL or product name. Use Google Search to find information about this product including its marketing claims, ingredient list, and customer reviews.

After researching, analyze the product and return ONLY a valid JSON object with:
1. Scam Risk Score (0-100)
2. Key Reasons (3-5 bullet points)

Use these criteria:
- Are the claims unrealistic or exaggerated?
- Do the ingredients support the claims?
- Are there signs of fake or AI-generated reviews?
- Does the brand seem untrustworthy or generic?
- Is there misleading "scientific" language?

Be skeptical and critical. Return ONLY this JSON format, no other text:
{
  "score": number,
  "reasons": ["...", "...", "..."]
}`

const CHECK_ITEMS = [
  { icon: '🧪', label: 'Ingredients', desc: 'Checks for proven actives' },
  { icon: '⚠️', label: 'Red Flags', desc: 'Spots exaggerated claims' },
  { icon: '💬', label: 'Reviews', desc: 'Detects fake patterns' },
  { icon: '🏷️', label: 'Brand Trust', desc: 'Evaluates credibility' },
]

function ScoreRing({ score }) {
  const color = score >= 70 ? '#eba0a0' : score >= 40 ? '#d4af37' : '#a8bfa4'
  const label = score >= 70 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk'
  const circumference = 2 * Math.PI * 58
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="score-ring-wrapper">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="58" fill="none" stroke="rgba(235,160,160,0.18)" strokeWidth="14" />
        <circle
          cx="80" cy="80" r="58"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="14"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
          filter="url(#glow)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="80" y="72" textAnchor="middle" fill={color} fontSize="30" fontWeight="800">{score}</text>
        <text x="80" y="90" textAnchor="middle" fill="currentColor" fillOpacity="0.4" fontSize="11" fontWeight="500" letterSpacing="1">OUT OF 100</text>
      </svg>
      <span className="score-label" style={{ color }}>{label}</span>
    </div>
  )
}

function ScoreBar({ score }) {
  const color = score >= 70 ? '#eba0a0' : score >= 40 ? '#d4af37' : '#a8bfa4'
  return (
    <div className="score-bar-track">
      <div
        className="score-bar-fill"
        style={{ width: `${score}%`, background: color, transition: 'width 1s ease' }}
      />
      <div className="score-bar-markers">
        <span style={{ left: '40%' }} className="score-bar-marker" />
        <span style={{ left: '70%' }} className="score-bar-marker" />
      </div>
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useState(false)
  const [mode, setMode] = useState('search') // 'search' | 'paste'
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function analyze() {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    const verified = VERIFIED_PRODUCTS.find(p => p.match.test(input))
    if (verified) {
      setResult(verified.result)
      setLoading(false)
      return
    }

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) throw new Error('Missing VITE_GEMINI_API_KEY in .env')

      const isSearch = mode === 'search'
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
      const body = {
        systemInstruction: { parts: [{ text: isSearch ? SEARCH_PROMPT : PASTE_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { maxOutputTokens: 512 },
        ...(isSearch && { tools: [{ googleSearch: {} }] }),
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err?.error?.message || `API error ${response.status}`)
      }

      const data = await response.json()
      const parts = data.candidates?.[0]?.content?.parts ?? []
      const text = parts.map(p => p.text ?? '').join('').trim()
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      if (typeof parsed.score !== 'number' || !Array.isArray(parsed.reasons)) {
        throw new Error('Unexpected response format from API')
      }
      setResult(applyLocalRules(parsed, input))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && mode === 'paste') analyze()
  }

  function switchMode(m) {
    setMode(m)
    setInput('')
    setResult(null)
    setError(null)
  }

  return (
    <div className={`app-root ${dark ? 'dark' : 'light'}`}>
      <button className="theme-toggle" onClick={() => setDark(d => !d)} aria-label="Toggle theme">
        {dark ? '☀️' : '🌙'}
      </button>
    <div className="page">
      <header className="header">
        <div className="hero-glow" />
        <div className="logo">
          <span className="logo-icon">✦</span>
          Unmask AI
        </div>
        <p className="tagline">Detect misleading skincare products before you buy</p>
        <div className="gold-rule" />

        <div className="check-grid">
          {CHECK_ITEMS.map(({ icon, label, desc }) => (
            <div key={label} className="check-card">
              <span className="check-icon">{icon}</span>
              <span className="check-label">{label}</span>
              <span className="check-desc">{desc}</span>
            </div>
          ))}
        </div>
      </header>

      <main className="card">
        <div className="tabs">
          <button
            className={`tab ${mode === 'search' ? 'tab-active' : ''}`}
            onClick={() => switchMode('search')}
          >
            🔗 Link or Name
          </button>
          <button
            className={`tab ${mode === 'paste' ? 'tab-active' : ''}`}
            onClick={() => switchMode('paste')}
          >
            📋 Paste Info
          </button>
        </div>

        {mode === 'search' ? (
          <input
            className="text-input"
            type="text"
            placeholder="e.g. CeraVe Moisturizing Cream  or  https://amazon.com/dp/..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze()}
          />
        ) : (
          <textarea
            className="textarea"
            placeholder="Paste product claims, ingredients, and reviews here…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={8}
          />
        )}

        <div className="btn-row">
          <button
            className="btn"
            onClick={analyze}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <><span className="spinner" /> Analyzing…</>
              : <><span className="btn-icon">✦</span> Analyze Product</>
            }
          </button>
          {mode === 'paste' && <p className="hint">⌘ + Enter to analyze</p>}
        </div>
      </main>

      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="result-card">
          <div className="result-top">
            <ScoreRing score={result.score} />
            <div className="result-meta">
              <p className="result-label">Scam Risk Score</p>
              <ScoreBar score={result.score} />
              <div className="bar-legend">
                <span style={{ color: '#a8bfa4' }}>Low</span>
                <span style={{ color: '#d4af37' }}>Medium</span>
                <span style={{ color: '#eba0a0' }}>High</span>
              </div>
            </div>
          </div>

          <div className="divider" />

          <p className="reasons-heading">Analysis</p>
          <ul className="reasons">
            {result.reasons.map((r, i) => (
              <li key={i} className="reason-item">
                <span className="reason-index">{i + 1}</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </div>
  )
}
