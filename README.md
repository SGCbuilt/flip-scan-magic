# FlipScan Pro

Real estate flip opportunity search platform powered by RentCast API + Claude AI.

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env` file (copy from `.env.example`):

```
VITE_ANTHROPIC_API_KEY=your_anthropic_key_here
```

The RentCast API key is already configured in `src/lib/rentcast.ts`.

## Deploy to Vercel / Netlify / Lovable

1. Push to a GitHub repo
2. Connect repo to Vercel / Netlify
3. Add `VITE_ANTHROPIC_API_KEY` in environment variable settings
4. Deploy

## Features

- Live RentCast property search with filters
- Flip scoring engine (0–100) with 70% rule analysis
- Full P&L breakdown per property
- Comparable sales lookup
- Claude AI deep deal analysis
- Standalone deal calculator
- Market intelligence dashboard
