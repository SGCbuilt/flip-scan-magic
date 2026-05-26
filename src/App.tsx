// ============================================================
//  SGC INVEST v4.0 — Real-Time Prices + Technical Analysis
//  24 Stocks · 21 Barsi Criteria · Live Yahoo Finance Data
//  SGC General Contractors · sgcbuilt.com · (703) 944-9770
//
//  SETUP:
//  1. Lovable → Supabase → Connect project
//  2. SQL Editor → run schema (portfolios + watchlists tables)
//  3. Edge Functions → "sgc-ai" → deploy sgc-ai-edge-function.ts
//  4. Settings → Secrets → ANTHROPIC_API_KEY = sk-ant-...
//  5. Replace SUPABASE_URL + SUPABASE_ANON_KEY below
//  6. Paste as src/App.tsx
// ============================================================

import React, {
  useState, useEffect, useRef, useMemo, useCallback,
  createContext, useContext,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./integrations/supabase/client";

// ── LIVE DATE COMPONENT ─────────────────────────────────────
function LiveDate() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums", letterSpacing: 0.5 }}>
      {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {" "}
      {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const AI_URL       = `${SUPABASE_URL}/functions/v1/sgc-ai`;
const PROXY        = "https://api.allorigins.win/get?url=";

// ── THEME ─────────────────────────────────────────────────────
const T = {
  navy:"#1a3a8f", navyD:"#0f2460", gold:"#c9a84c",
  green:"#16a34a", red:"#dc2626", amber:"#d97706",
  bg:"#f0f4ff", card:"#ffffff", border:"#dde3f0",
  text:"#1e293b", muted:"#64748b", light:"#f8faff",
  shadow:"0 2px 12px rgba(26,58,143,0.08)",
};
const SEC_COLOR: Record<string,string> = {
  Banks:"#1e40af",Energy:"#d97706",Pipelines:"#e55c00",
  Utilities:"#059669",Telecom:"#7c3aed",REITs:"#0891b2",
  "Consumer Staples":"#16a34a",Healthcare:"#dc2626",Industrials:"#64748b",
};
const SEC_BG: Record<string,string> = {
  Banks:"#eff6ff",Energy:"#fffbeb",Pipelines:"#fff7ed",
  Utilities:"#f0fdf4",Telecom:"#faf5ff",REITs:"#ecfdf5",
  "Consumer Staples":"#f0fdf4",Healthcare:"#fff1f2",Industrials:"#f8fafc",
};
const TARGET_YIELD: Record<string,number> = {
  Banks:0.030,Energy:0.035,Pipelines:0.045,Utilities:0.035,
  Telecom:0.042,REITs:0.045,"Consumer Staples":0.025,
  Healthcare:0.025,Industrials:0.025,
};

// ── STATIC FUNDAMENTAL DATA ───────────────────────────────────
// Prices/yields updated live from Yahoo Finance
// Fundamentals (FCF, ROE, streak, etc.) are annual — updated quarterly
const STOCKS_BASE = [
  {sym:"JPM",name:"JPMorgan Chase",sector:"Banks",country:"US",yahooSym:"JPM",
   dpa:6.00,dy5y:[2.5,2.4,2.3,2.2,1.93],streak:14,
   payout:28,fcfPayout:29,fcfYield:6.8,profitStreak:14,epsGrowth:12.4,
   pe_static:14.68,pb:2.0,roe:17.0,ebitdaMargin:42.1,ndEbitda:0.8,debtEq:1.1,revGrowth:9.2,
   mgmt:9,mgmtNote:"Jamie Dimon — best capital allocator in banking, 20yr tenure",
   moat:9,moatNote:"#1 US bank, irreplaceable global clearing infrastructure, 30M clients",
   volM:1840,intrinsic:340,freq:"quarterly",rateSens:"low",recur:true,abbr:"JP",
   desc:"Largest US bank. 14 consecutive increases. FCF yield 6.8%, payout only 29%."},
  {sym:"BAC",name:"Bank of America",sector:"Banks",country:"US",yahooSym:"BAC",
   dpa:1.04,dy5y:[1.8,1.9,2.0,2.1,2.09],streak:11,
   payout:32,fcfPayout:43,fcfYield:5.4,profitStreak:11,epsGrowth:8.4,
   pe_static:12.25,pb:1.4,roe:10.2,ebitdaMargin:36.8,ndEbitda:1.2,debtEq:1.3,revGrowth:6.8,
   mgmt:8,mgmtNote:"Brian Moynihan — Buffett-endorsed (13% Berkshire stake)",
   moat:8,moatNote:"2nd largest US bank, 68M clients, massive deposit franchise",
   volM:920,intrinsic:58,freq:"quarterly",rateSens:"low",recur:true,abbr:"BA",
   desc:"Buffett's #1 holding. P/E 12.25 — value zone. 11 consecutive increases."},
  {sym:"WFC",name:"Wells Fargo",sector:"Banks",country:"US",yahooSym:"WFC",
   dpa:1.80,dy5y:[1.5,1.6,1.8,2.0,2.36],streak:5,
   payout:33,fcfPayout:45,fcfYield:5.1,profitStreak:5,epsGrowth:6.2,
   pe_static:13.8,pb:1.6,roe:11.4,ebitdaMargin:34.2,ndEbitda:1.0,debtEq:1.2,revGrowth:5.4,
   mgmt:7,mgmtNote:"Charlie Scharf — $0.45/qtr declared, asset cap removal imminent",
   moat:7,moatNote:"3rd largest US bank, commercial banking dominance",
   volM:610,intrinsic:88,freq:"quarterly",rateSens:"low",recur:true,abbr:"WF",
   desc:"$0.45/qtr ($1.80 ann.). 23% EPS growth Q1 2026. Asset cap removal = earnings unlock."},
  {sym:"XOM",name:"ExxonMobil",sector:"Energy",country:"US",yahooSym:"XOM",
   dpa:3.96,dy5y:[5.4,4.8,3.9,3.6,3.50],streak:42,
   payout:42,fcfPayout:55,fcfYield:7.2,profitStreak:30,epsGrowth:8.4,
   pe_static:14.2,pb:2.0,roe:14.2,ebitdaMargin:24.8,ndEbitda:0.6,debtEq:0.3,revGrowth:4.8,
   mgmt:8,mgmtNote:"Darren Woods — Pioneer acquisition mastery, $20B buyback+dividend",
   moat:8,moatNote:"Lowest-cost Permian producer, global LNG, proprietary refining",
   volM:1240,intrinsic:128,freq:"quarterly",rateSens:"low",recur:false,abbr:"XO",
   desc:"Dividend King 42yrs. FCF yield 7.2%, payout 55%. 0.3x D/E fortress."},
  {sym:"CVX",name:"Chevron",sector:"Energy",country:"US",yahooSym:"CVX",
   dpa:6.84,dy5y:[5.5,5.0,4.4,4.2,3.57],streak:37,
   payout:58,fcfPayout:67,fcfYield:6.4,profitStreak:28,epsGrowth:5.8,
   pe_static:33.22,pb:1.9,roe:11.8,ebitdaMargin:22.4,ndEbitda:0.4,debtEq:0.2,revGrowth:3.2,
   mgmt:8,mgmtNote:"Mike Wirth — Hess adds Guyana world-class offshore resource",
   moat:7,moatNote:"Diversified upstream/downstream, lowest D/E of major oils",
   volM:820,intrinsic:210,freq:"quarterly",rateSens:"low",recur:false,abbr:"CV",
   desc:"Dividend Aristocrat 37yrs. P/E 33.22. 0.2x D/E — cleanest balance sheet."},
  {sym:"NEE",name:"NextEra Energy",sector:"Utilities",country:"US",yahooSym:"NEE",
   dpa:2.27,dy5y:[2.5,2.7,2.9,3.0,3.30],streak:29,
   payout:62,fcfPayout:71,fcfYield:3.2,profitStreak:29,epsGrowth:8.8,
   pe_static:22.4,pb:2.6,roe:11.8,ebitdaMargin:48.2,ndEbitda:4.8,debtEq:1.6,revGrowth:11.8,
   mgmt:9,mgmtNote:"John Ketchum — 10% annual DPS growth delivered 20+ years",
   moat:9,moatNote:"Florida regulated monopoly + world's largest renewables developer",
   volM:380,intrinsic:82,freq:"quarterly",rateSens:"high",recur:true,abbr:"NE",
   desc:"World's largest renewable energy. Dividend CAGR 10% over 20 years. 29yr streak."},
  {sym:"SO",name:"Southern Company",sector:"Utilities",country:"US",yahooSym:"SO",
   dpa:2.92,dy5y:[4.1,3.9,3.6,3.3,3.16],streak:23,
   payout:78,fcfPayout:88,fcfYield:2.8,profitStreak:23,epsGrowth:4.8,
   pe_static:22.8,pb:2.8,roe:12.4,ebitdaMargin:38.4,ndEbitda:5.2,debtEq:1.9,revGrowth:4.2,
   mgmt:7,mgmtNote:"Chris Womack — Vogtle nuclear operational, steady regulated returns",
   moat:8,moatNote:"Electric monopoly 9M customers Southeast US",
   volM:180,intrinsic:100,freq:"quarterly",rateSens:"high",recur:true,abbr:"SO",
   desc:"23 consecutive increases. Regulated monopoly 9M customers."},
  {sym:"VZ",name:"Verizon",sector:"Telecom",country:"US",yahooSym:"VZ",
   dpa:2.71,dy5y:[5.8,6.0,6.1,6.3,5.61],streak:18,
   payout:52,fcfPayout:68,fcfYield:7.8,profitStreak:18,epsGrowth:2.8,
   pe_static:10.2,pb:1.8,roe:17.4,ebitdaMargin:35.4,ndEbitda:2.5,debtEq:2.4,revGrowth:2.4,
   mgmt:7,mgmtNote:"Dan Schulman (new CEO 2026) — 5G complete, fixed wireless surging",
   moat:7,moatNote:"National 5G, 113M subscribers, massive infrastructure switching costs",
   volM:480,intrinsic:48,freq:"quarterly",rateSens:"medium",recur:true,abbr:"VZ",
   desc:"18yr streak. FCF yield 7.8%. New CEO Dan Schulman 2026."},
  {sym:"T",name:"AT&T",sector:"Telecom",country:"US",yahooSym:"T",
   dpa:1.11,dy5y:[6.8,5.0,5.2,5.2,4.96],streak:4,
   payout:55,fcfPayout:66,fcfYield:8.4,profitStreak:4,epsGrowth:2.1,
   pe_static:11.2,pb:1.1,roe:9.8,ebitdaMargin:32.1,ndEbitda:2.8,debtEq:1.6,revGrowth:1.4,
   mgmt:6,mgmtNote:"John Stankey — fiber 28M+ locations, WarnerMedia spin complete",
   moat:6,moatNote:"National fiber network, FirstNet contract, wireless scale",
   volM:420,intrinsic:26,freq:"quarterly",rateSens:"medium",recur:true,abbr:"AT",
   desc:"Pure telecom post-WarnerMedia. FCF yield 8.4% covers 66% payout."},
  {sym:"O",name:"Realty Income",sector:"REITs",country:"US",yahooSym:"O",
   dpa:3.246,dy5y:[4.5,4.8,5.1,5.4,5.23],streak:31,
   payout:76,fcfPayout:72,fcfYield:5.4,profitStreak:31,epsGrowth:2.8,
   pe_static:42.8,pb:1.3,roe:3.2,ebitdaMargin:94.2,ndEbitda:5.4,debtEq:0.9,revGrowth:14.2,
   mgmt:9,mgmtNote:"Sumit Roy — 671st consecutive monthly dividend declared May 14 2026",
   moat:8,moatNote:"15,500+ properties, net lease shifts all costs to tenants",
   volM:620,intrinsic:68,freq:"monthly",rateSens:"high",recur:true,abbr:"RI",
   desc:"671st monthly dividend. DPS $3.246. Ex-div May29 2026."},
  {sym:"KO",name:"Coca-Cola",sector:"Consumer Staples",country:"US",yahooSym:"KO",
   dpa:2.12,dy5y:[3.4,3.2,3.1,2.9,2.61],streak:62,
   payout:72,fcfPayout:68,fcfYield:4.2,profitStreak:62,epsGrowth:8.4,
   pe_static:28.4,pb:10.8,roe:38.4,ebitdaMargin:32.1,ndEbitda:2.4,debtEq:2.1,revGrowth:6.4,
   mgmt:9,mgmtNote:"James Quincey — pricing power proven through inflation cycles",
   moat:10,moatNote:"Most recognized brand on earth, 200 countries, 130yr equity",
   volM:680,intrinsic:78,freq:"quarterly",rateSens:"medium",recur:true,abbr:"KO",
   desc:"Dividend King 62yrs. Q1 EPS $0.86 beat. Moat 10/10."},
  {sym:"PG",name:"Procter & Gamble",sector:"Consumer Staples",country:"US",yahooSym:"PG",
   dpa:4.03,dy5y:[2.6,2.5,2.4,2.4,2.87],streak:68,
   payout:60,fcfPayout:64,fcfYield:3.8,profitStreak:68,epsGrowth:9.2,
   pe_static:26.4,pb:7.8,roe:29.8,ebitdaMargin:26.2,ndEbitda:1.8,debtEq:0.8,revGrowth:5.8,
   mgmt:10,mgmtNote:"Jon Moeller — 68yr streak is the management testament, ROIC 18%",
   moat:10,moatNote:"Tide, Gillette, Pampers, Oral-B — 180+ countries irreplaceable",
   volM:580,intrinsic:175,freq:"quarterly",rateSens:"medium",recur:true,abbr:"PG",
   desc:"Dividend King 68yrs — LONGEST on S&P 500. ROIC 18%."},
  {sym:"MO",name:"Altria Group",sector:"Consumer Staples",country:"US",yahooSym:"MO",
   dpa:4.08,dy5y:[7.8,7.8,8.2,7.9,6.30],streak:57,
   payout:79,fcfPayout:84,fcfYield:9.4,profitStreak:55,epsGrowth:6.4,
   pe_static:10.4,pb:12.4,roe:124.8,ebitdaMargin:56.8,ndEbitda:2.8,debtEq:5.4,revGrowth:-1.8,
   mgmt:8,mgmtNote:"Billy Gifford — Marlboro 42% US share, NJOY + on! oral nicotine",
   moat:9,moatNote:"Regulatory barriers prevent new entrants. Addiction is an economic moat.",
   volM:420,intrinsic:62,freq:"quarterly",rateSens:"low",recur:true,abbr:"AL",
   desc:"Dividend King 57yrs. FCF yield 9.4%. Net margin 42%."},
  {sym:"JNJ",name:"Johnson & Johnson",sector:"Healthcare",country:"US",yahooSym:"JNJ",
   dpa:5.36,dy5y:[2.6,2.6,2.7,2.8,2.34],streak:62,
   payout:46,fcfPayout:54,fcfYield:5.4,profitStreak:62,epsGrowth:7.8,
   pe_static:17.4,pb:5.2,roe:30.4,ebitdaMargin:34.8,ndEbitda:0.8,debtEq:0.5,revGrowth:5.8,
   mgmt:9,mgmtNote:"Joaquin Duato — Kenvue spin complete, talc resolved, strong pipeline",
   moat:9,moatNote:"Largest medtech globally, 50% revenue from #1 or #2 positions",
   volM:520,intrinsic:260,freq:"quarterly",rateSens:"low",recur:true,abbr:"JJ",
   desc:"Dividend King 62yrs. DPS $5.36, yield 2.34%."},
  {sym:"ABT",name:"Abbott Labs",sector:"Healthcare",country:"US",yahooSym:"ABT",
   dpa:2.44,dy5y:[1.4,1.4,1.5,1.7,1.87],streak:52,
   payout:48,fcfPayout:45,fcfYield:4.2,profitStreak:52,epsGrowth:8.8,
   pe_static:24.8,pb:5.4,roe:21.8,ebitdaMargin:24.8,ndEbitda:0.9,debtEq:0.6,revGrowth:7.2,
   mgmt:9,mgmtNote:"Robert Ford — FreeStyle Libre #1 CGM globally, 8-9% DPS growth",
   moat:9,moatNote:"FreeStyle Libre: switching costs are literally life-or-death for diabetics",
   volM:380,intrinsic:150,freq:"quarterly",rateSens:"low",recur:true,abbr:"AB",
   desc:"Dividend King 52yrs. FCF payout only 45% — ultra-sustainable."},
  {sym:"MDT",name:"Medtronic",sector:"Healthcare",country:"US",yahooSym:"MDT",
   dpa:2.80,dy5y:[2.2,2.4,2.8,3.0,3.28],streak:47,
   payout:52,fcfPayout:57,fcfYield:6.2,profitStreak:47,epsGrowth:2.8,
   pe_static:18.4,pb:2.2,roe:12.4,ebitdaMargin:28.4,ndEbitda:2.4,debtEq:0.6,revGrowth:3.8,
   mgmt:7,mgmtNote:"Geoff Martha — restructuring, 50%+ FCF returned to shareholders",
   moat:8,moatNote:"Largest pure-play medtech, hospital partner, FDA approval barrier",
   volM:280,intrinsic:112,freq:"quarterly",rateSens:"low",recur:true,abbr:"MD",
   desc:"Dividend Aristocrat 47yrs. Trades 24% below Morningstar $112 fair value."},
  {sym:"EMR",name:"Emerson Electric",sector:"Industrials",country:"US",yahooSym:"EMR",
   dpa:2.10,dy5y:[2.4,2.4,2.2,2.0,1.81],streak:67,
   payout:38,fcfPayout:38,fcfYield:4.8,profitStreak:67,epsGrowth:6.8,
   pe_static:22.4,pb:4.2,roe:18.8,ebitdaMargin:28.4,ndEbitda:1.4,debtEq:0.6,revGrowth:5.8,
   mgmt:9,mgmtNote:"Lal Karsanbhai — Aspen Technology merger, 67yr unbroken streak",
   moat:8,moatNote:"Mission-critical process automation — switching vendor costs $10M+",
   volM:180,intrinsic:132,freq:"quarterly",rateSens:"medium",recur:true,abbr:"EM",
   desc:"Dividend King 67yrs. Payout only 38% of BOTH earnings AND cash flow."},
  {sym:"RY",name:"Royal Bank of Canada",sector:"Banks",country:"CA",yahooSym:"RY",
   dpa:5.20,dy5y:[3.8,3.9,4.0,4.1,4.36],streak:14,
   payout:48,fcfPayout:46,fcfYield:6.2,profitStreak:14,epsGrowth:8.4,
   pe_static:13.4,pb:2.0,roe:14.8,ebitdaMargin:42.8,ndEbitda:1.0,debtEq:1.1,revGrowth:8.4,
   mgmt:9,mgmtNote:"Dave McKay — HSBC Canada ($130B assets) integrated, #1 wealth mgmt",
   moat:9,moatNote:"Canada's largest bank. 6-bank oligopoly controls 85%+ of market",
   volM:380,intrinsic:138,freq:"quarterly",rateSens:"low",recur:true,abbr:"RY",
   desc:"TSX C$242.84. HSBC Canada adds $130B assets. 4.36% yield."},
  {sym:"TD",name:"TD Bank Group",sector:"Banks",country:"CA",yahooSym:"TD",
   dpa:3.00,dy5y:[3.8,4.0,4.2,4.6,5.23],streak:14,
   payout:52,fcfPayout:52,fcfYield:7.2,profitStreak:14,epsGrowth:4.8,
   pe_static:12.8,pb:1.4,roe:10.8,ebitdaMargin:38.2,ndEbitda:1.1,debtEq:1.2,revGrowth:4.8,
   mgmt:6,mgmtNote:"Raymond Chun (new CEO) — AML consent order being resolved",
   moat:8,moatNote:"Largest Canadian bank US network (1,200+ branches), oligopoly",
   volM:340,intrinsic:72,freq:"quarterly",rateSens:"low",recur:true,abbr:"TD",
   desc:"AML penalty one-time — buying opportunity. 5.23% yield."},
  {sym:"BNS",name:"Bank of Nova Scotia",sector:"Banks",country:"CA",yahooSym:"BNS",
   dpa:2.62,dy5y:[4.8,5.0,5.2,5.4,5.55],streak:10,
   payout:58,fcfPayout:57,fcfYield:8.2,profitStreak:10,epsGrowth:3.4,
   pe_static:11.4,pb:1.2,roe:10.4,ebitdaMargin:36.4,ndEbitda:1.2,debtEq:1.3,revGrowth:3.4,
   mgmt:7,mgmtNote:"Scott Thomson (new CEO) — refocusing on North America turnaround",
   moat:7,moatNote:"Highest yield of Big 6 Canadian banks. P/Book 1.2x discount.",
   volM:240,intrinsic:58,freq:"quarterly",rateSens:"low",recur:true,abbr:"BN",
   desc:"Highest yield of Big 6 at 5.55%. P/Book 1.2x — below peers."},
  {sym:"ENB",name:"Enbridge",sector:"Pipelines",country:"CA",yahooSym:"ENB",
   dpa:2.78,dy5y:[6.4,6.0,5.8,5.2,4.79],streak:29,
   payout:126,fcfPayout:88,fcfYield:5.8,profitStreak:29,epsGrowth:6.4,
   pe_static:27.11,pb:1.8,roe:7.4,ebitdaMargin:46.2,ndEbitda:5.8,debtEq:1.8,revGrowth:6.4,
   mgmt:8,mgmtNote:"Greg Ebel — $4B BC pipeline federally approved May 2026, $40B backlog",
   moat:9,moatNote:"30% NA crude, 20% US natural gas. All-time high reached May 2026.",
   volM:480,intrinsic:66,freq:"quarterly",rateSens:"medium",recur:true,abbr:"EN",
   desc:"29yr streak. $4B BC pipeline approved May 2026. DCF payout ~70%."},
  {sym:"TRP",name:"TC Energy",sector:"Pipelines",country:"CA",yahooSym:"TRP",
   dpa:3.34,dy5y:[5.8,6.2,6.8,7.0,7.39],streak:24,
   payout:104,fcfPayout:82,fcfYield:6.8,profitStreak:24,epsGrowth:4.8,
   pe_static:21.4,pb:2.4,roe:11.4,ebitdaMargin:52.4,ndEbitda:6.4,debtEq:2.1,revGrowth:4.8,
   mgmt:7,mgmtNote:"François Poirier — South Bow spin complete, natural gas + nuclear focus",
   moat:8,moatNote:"Essential NA gas infrastructure, take-or-pay contracts, Ontario nuclear",
   volM:280,intrinsic:54,freq:"quarterly",rateSens:"medium",recur:true,abbr:"TC",
   desc:"Highest pipeline yield 7.39%. 24 consecutive increases."},
  {sym:"FTS",name:"Fortis Inc.",sector:"Utilities",country:"CA",yahooSym:"FTS",
   dpa:1.81,dy5y:[3.9,4.0,4.1,4.4,3.17],streak:51,
   payout:78,fcfPayout:88,fcfYield:4.2,profitStreak:51,epsGrowth:5.4,
   pe_static:18.4,pb:1.4,roe:7.8,ebitdaMargin:44.8,ndEbitda:5.8,debtEq:1.4,revGrowth:5.8,
   mgmt:9,mgmtNote:"David Hutchens — 51yr streak, $26B capital plan 4-6% DPS growth 2028",
   moat:8,moatNote:"Regulated utilities in 10 jurisdictions, guaranteed returns",
   volM:120,intrinsic:52,freq:"quarterly",rateSens:"high",recur:true,abbr:"FT",
   desc:"Dividend King 51yrs. 4-6% annual DPS growth through 2028 backed by $26B plan."},
];

// ── OHLCV TYPE ────────────────────────────────────────────────
interface Bar { t:number; o:number; h:number; l:number; c:number; v:number }

// ── LIVE DATA FETCHER ─────────────────────────────────────────
async function fetchQuote(sym:string): Promise<{price:number;chg:number;chgPct:number;vol:number;mktCap:number;pe:number;week52h:number;week52l:number}|null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
    const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);
    const raw = await res.json();
    const data = JSON.parse(raw.contents||"{}");
    const meta = data?.chart?.result?.[0]?.meta;
    if(!meta) return null;
    const price = meta.regularMarketPrice || meta.previousClose || 0;
    const prev  = meta.chartPreviousClose || meta.previousClose || price;
    return {
      price,
      chg: price - prev,
      chgPct: ((price-prev)/prev)*100,
      vol: meta.regularMarketVolume || 0,
      mktCap: meta.marketCap || 0,
      pe: meta.trailingPE || 0,
      week52h: meta.fiftyTwoWeekHigh || 0,
      week52l: meta.fiftyTwoWeekLow || 0,
    };
  } catch { return null; }
}

async function fetchBars(sym:string, range="6mo"): Promise<Bar[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=${range}`;
    const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);
    const raw = await res.json();
    const data = JSON.parse(raw.contents||"{}");
    const result = data?.chart?.result?.[0];
    if(!result) return [];
    const ts = result.timestamp||[];
    const q  = result.indicators?.quote?.[0]||{};
    const bars: Bar[] = [];
    for(let i=0;i<ts.length;i++) {
      if(q.close?.[i]==null) continue;
      bars.push({t:ts[i]*1000,o:q.open?.[i]||q.close[i],h:q.high?.[i]||q.close[i],l:q.low?.[i]||q.close[i],c:q.close[i],v:q.volume?.[i]||0});
    }
    return bars;
  } catch { return []; }
}

// ── TECHNICAL INDICATORS ──────────────────────────────────────
const closes = (b:Bar[]) => b.map(x=>x.c);
const highs  = (b:Bar[]) => b.map(x=>x.h);
const lows   = (b:Bar[]) => b.map(x=>x.l);

function ema(src:number[],p:number):number[] {
  const k=2/(p+1); let e=src[0];
  return src.map(v=>(e=v*k+e*(1-k)));
}
function sma(src:number[],p:number):(number|null)[] {
  return src.map((_,i)=>i<p-1?null:src.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p);
}
function rsi(src:number[],p=14):number[] {
  const r:number[]=[];
  for(let i=0;i<src.length;i++) {
    if(i<p){r.push(50);continue;}
    let g=0,l=0;
    for(let j=i-p+1;j<=i;j++){const d=src[j]-src[j-1];d>0?g+=d:l-=d;}
    const ag=g/p,al=l/p;r.push(al===0?100:100-100/(1+ag/al));
  }
  return r;
}
function macd(src:number[],fast=12,slow=26,sig=9) {
  const e12=ema(src,fast),e26=ema(src,slow);
  const line=e12.map((v,i)=>v-e26[i]);
  const signal=ema(line,sig);
  return {line,signal,hist:line.map((v,i)=>v-signal[i])};
}
function bollinger(src:number[],p=20,mult=2) {
  const mid=sma(src,p) as number[];
  const upper=mid.map((m,i)=>{if(!m)return null;const sl=src.slice(i-p+1,i+1),std=Math.sqrt(sl.reduce((a,v)=>a+(v-m)**2,0)/p);return m+mult*std;});
  const lower=mid.map((m,i)=>{if(!m)return null;const sl=src.slice(i-p+1,i+1),std=Math.sqrt(sl.reduce((a,v)=>a+(v-m)**2,0)/p);return m-mult*std;});
  return {upper,mid,lower};
}
function stochastic(bars:Bar[],k=14,d=3) {
  const ka:number[]=[];
  for(let i=0;i<bars.length;i++) {
    if(i<k-1){ka.push(50);continue;}
    const sl=bars.slice(i-k+1,i+1);
    const lo=Math.min(...sl.map(b=>b.l)),hi=Math.max(...sl.map(b=>b.h));
    ka.push(hi===lo?50:((bars[i].c-lo)/(hi-lo))*100);
  }
  return {k:ka,d:ema(ka,d)};
}
function atr(bars:Bar[],p=14):number[] {
  const tr=bars.map((_,i)=>i===0?bars[0].h-bars[0].l:Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c)));
  return ema(tr,p);
}
function adx(bars:Bar[],p=14) {
  const tr=bars.map((_,i)=>i===0?bars[0].h-bars[0].l:Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c)));
  const pdm=bars.map((_,i)=>i===0?0:Math.max(bars[i].h-bars[i-1].h,0));
  const ndm=bars.map((_,i)=>i===0?0:Math.max(bars[i-1].l-bars[i].l,0));
  const atrE=ema(tr,p),pdiE=ema(pdm,p),ndiE=ema(ndm,p);
  const pdi=pdiE.map((v,i)=>atrE[i]?v/atrE[i]*100:0);
  const ndi=ndiE.map((v,i)=>atrE[i]?v/atrE[i]*100:0);
  const dx=pdi.map((v,i)=>v+ndi[i]?Math.abs(v-ndi[i])/(v+ndi[i])*100:0);
  return {adx:ema(dx,p),pdi,ndi};
}
function vwap(bars:Bar[]):number[] {
  let cpv=0,cv=0;
  return bars.map(b=>{cpv+=(b.h+b.l+b.c)/3*b.v;cv+=b.v;return cv?cpv/cv:b.c;});
}
function fib(bars:Bar[]) {
  const hi=Math.max(...highs(bars)),lo=Math.min(...lows(bars)),d=hi-lo;
  return {hi,lo,r236:hi-d*0.236,r382:hi-d*0.382,r500:hi-d*0.5,r618:hi-d*0.618,r786:hi-d*0.786};
}
function parabolicSAR(bars:Bar[]) {
  let bull=true,af=0.02,ep=bars[0].l,sar=bars[0].h;
  return bars.map((b,i)=>{
    if(i===0)return sar;
    sar+=af*(ep-sar);
    if(bull){if(b.h>ep){ep=b.h;af=Math.min(af+0.02,0.2);}if(b.l<sar){bull=false;sar=ep;ep=b.l;af=0.02;}}
    else{if(b.l<ep){ep=b.l;af=Math.min(af+0.02,0.2);}if(b.h>sar){bull=true;sar=ep;ep=b.h;af=0.02;}}
    return sar;
  });
}

// ── TECHNICAL SIGNAL ENGINE ───────────────────────────────────
interface TechVote { name:string; signal:"BULL"|"BEAR"|"NEUTRAL"; value:string; detail:string; weight:number }
interface TechAnalysis { score:number; label:string; color:string; bg:string; votes:TechVote[]; setup:{entry:number;stop:number;target:number;rr:string;side:"LONG"|"SHORT"|"WAIT"} }

function runTechSignals(bars:Bar[]): TechAnalysis {
  const src=closes(bars),last=src[src.length-1];
  const votes:TechVote[]=[];

  // RSI
  const rsiArr=rsi(src,14),rv=rsiArr[rsiArr.length-1];
  votes.push({name:"RSI(14)",weight:15,value:`${rv.toFixed(0)}`,
    signal:rv<30?"BULL":rv>70?"BEAR":"NEUTRAL",
    detail:rv<30?`Oversold at ${rv.toFixed(0)} — potential reversal zone`:rv>70?`Overbought at ${rv.toFixed(0)} — caution`:`Neutral at ${rv.toFixed(0)}`});

  // MACD
  const {line,hist}=macd(src);
  const hL=hist[hist.length-1],hP=hist[hist.length-2];
  const cross=(hP<0&&hL>0)||(hP>0&&hL<0);
  votes.push({name:"MACD(12,26,9)",weight:15,value:`${hL.toFixed(3)}`,
    signal:hL>0&&hL>hP?"BULL":hL<0&&hL<hP?"BEAR":"NEUTRAL",
    detail:cross?`⚡ Crossover signal!`:hL>0&&hL>hP?"Bullish histogram rising":hL<0&&hL<hP?"Bearish histogram falling":"Histogram decelerating"});

  // EMA trend
  const e20=ema(src,20),e50=ema(src,50),e200=ema(src,200);
  const abv20=last>e20[e20.length-1],abv50=last>e50[e50.length-1],abv200=last>e200[e200.length-1];
  const maScore=[abv20,abv50,abv200].filter(Boolean).length;
  votes.push({name:"Moving Averages",weight:20,value:`${maScore}/3 bull`,
    signal:maScore>=2?"BULL":maScore===0?"BEAR":"NEUTRAL",
    detail:`Price ${abv20?"above":"below"} EMA20 ${abv20?"✓":"✗"} · ${abv50?"above":"below"} EMA50 ${abv50?"✓":"✗"} · ${abv200?"above":"below"} EMA200 ${abv200?"✓":"✗"}`});

  // Bollinger
  const bb=bollinger(src);
  const bbU=bb.upper[bb.upper.length-1]??last,bbL=bb.lower[bb.lower.length-1]??last,bbM=bb.mid[bb.mid.length-1]??last;
  const bbPct=bbL?(last-bbL)/(bbU-bbL)*100:50;
  const squeeze=(bbU-bbL)/bbM*100;
  votes.push({name:"Bollinger Bands",weight:10,value:`%B ${bbPct.toFixed(0)}%`,
    signal:last<bbL?"BULL":last>bbU?"BEAR":bbPct<25?"BULL":"NEUTRAL",
    detail:last<bbL?"Below lower band — mean reversion setup":last>bbU?"Above upper band — overextended":squeeze<3?`⚡ Squeeze (${squeeze.toFixed(1)}% width) — breakout imminent`:`At ${bbPct.toFixed(0)}% of band`});

  // Stochastic
  const st=stochastic(bars);
  const skL=st.k[st.k.length-1],sdL=st.d[st.d.length-1];
  votes.push({name:"Stochastic(14)",weight:10,value:`K:${skL.toFixed(0)} D:${sdL.toFixed(0)}`,
    signal:skL<20?"BULL":skL>80?"BEAR":skL>sdL&&skL<50?"BULL":"NEUTRAL",
    detail:skL<20?"Oversold — %K in buy zone (<20)":skL>80?"Overbought — %K in sell zone (>80)":`%K ${skL>sdL?"above":"below"} %D signal`});

  // ADX
  const adxD=adx(bars);
  const adxV=adxD.adx[adxD.adx.length-1],pdiV=adxD.pdi[adxD.pdi.length-1],ndiV=adxD.ndi[adxD.ndi.length-1];
  votes.push({name:"ADX(14)",weight:10,value:`${adxV.toFixed(0)} (+${pdiV.toFixed(0)}/-${ndiV.toFixed(0)})`,
    signal:adxV>25&&pdiV>ndiV?"BULL":adxV>25&&ndiV>pdiV?"BEAR":"NEUTRAL",
    detail:adxV>25?`Strong trend (${adxV.toFixed(0)}) — ${pdiV>ndiV?"Bullish":"Bearish"} bias`:adxV>20?"Moderate trend forming":"No trend — ranging market"});

  // Price momentum 5-bar
  const mom5=((last-src[src.length-6])/src[src.length-6])*100;
  votes.push({name:"Momentum(5)",weight:5,value:`${mom5.toFixed(2)}%`,
    signal:mom5>1?"BULL":mom5<-1?"BEAR":"NEUTRAL",
    detail:`Price ${mom5>=0?"+":""}${mom5.toFixed(2)}% over last 5 sessions`});

  // Volume trend (OBV slope)
  let obv=0;
  const obvArr=[0,...bars.slice(1).map((b,i)=>(obv+=b.c>bars[i].c?b.v:b.c<bars[i].c?-b.v:0,obv))];
  const obvSlope=(obvArr[obvArr.length-1]-obvArr[obvArr.length-10])/Math.max(Math.abs(obvArr[obvArr.length-10]),1)*100;
  votes.push({name:"OBV Trend",weight:5,value:`${obvSlope.toFixed(1)}%`,
    signal:obvSlope>2?"BULL":obvSlope<-2?"BEAR":"NEUTRAL",
    detail:obvSlope>2?"Volume confirming upside — smart money accumulating":obvSlope<-2?"Volume confirming downside — distribution":"Flat OBV — no conviction"});

  // SAR
  const sarArr=parabolicSAR(bars);
  const sarLast=sarArr[sarArr.length-1];
  votes.push({name:"Parabolic SAR",weight:10,value:`$${sarLast.toFixed(2)}`,
    signal:last>sarLast?"BULL":"BEAR",
    detail:last>sarLast?`Price above SAR ($${sarLast.toFixed(2)}) — uptrend confirmed`:`Price below SAR ($${sarLast.toFixed(2)}) — downtrend active`});

  const tw=votes.reduce((a,v)=>a+v.weight,0);
  const bw=votes.filter(v=>v.signal==="BULL").reduce((a,v)=>a+v.weight,0);
  const score=Math.round(bw/tw*100);

  let label="NEUTRAL",color="#d97706",bg="#fffbeb";
  if(score>=75){label="STRONG BUY";color="#16a34a";bg="#f0fdf4";}
  else if(score>=60){label="BUY";color="#22c55e";bg="#f0fdf4";}
  else if(score<=25){label="STRONG SELL";color="#dc2626";bg="#fef2f2";}
  else if(score<=40){label="SELL";color="#ef4444";bg="#fef2f2";}

  const atrV=atr(bars,14).slice(-1)[0];
  let setup:TechAnalysis["setup"];
  if(score>=60){
    const entry=last,stop=last-atrV*2,target=last+atrV*4;
    setup={entry,stop,target,rr:((target-entry)/(entry-stop)).toFixed(2),side:"LONG"};
  } else if(score<=40){
    const entry=last,stop=last+atrV*2,target=last-atrV*4;
    setup={entry,stop,target,rr:((entry-target)/(stop-entry)).toFixed(2),side:"SHORT"};
  } else {
    setup={entry:last,stop:last-atrV,target:last+atrV,rr:"1.00",side:"WAIT"};
  }
  return {score,label,color,bg,votes,setup};
}

// ── BARSI SCORING ─────────────────────────────────────────────
function calcBarsiScore(s:any,livePrice:number) {
  const price=livePrice||s.price_static||100;
  const dy=s.dpa/price*100;
  let pts=0,max=0;
  const add=(p:number,m:number)=>{pts+=p;max+=m;};
  add(dy>=8?20:dy>=6?18:dy>=4?14:dy>=3?10:dy>=2?5:1,20);
  const sk=s.streak;
  add(sk>=50?18:sk>=25?16:sk>=15?13:sk>=10?10:sk>=5?6:1,18);
  add(s.dy5y[4]>s.dy5y[0]?7:3,10);
  add(s.payout<=40?8:s.payout<=60?7:s.payout<=80?5:s.payout<=100?3:1,8);
  add(s.fcfPayout<=50?10:s.fcfPayout<=70?8:s.fcfPayout<=90?6:s.fcfPayout<=110?3:1,10);
  add(s.fcfYield>=8?6:s.fcfYield>=5?5:s.fcfYield>=3?3:1,6);
  add(s.profitStreak>=30?8:s.profitStreak>=20?7:s.profitStreak>=10?5:s.profitStreak>=5?3:1,8);
  add(s.epsGrowth>=10?7:s.epsGrowth>=6?6:s.epsGrowth>=3?4:s.epsGrowth>=0?2:0,7);
  add(s.roe>=25?7:s.roe>=15?5:s.roe>=10?3:s.roe>=5?1:0,7);
  add(s.ebitdaMargin>=50?6:s.ebitdaMargin>=30?5:s.ebitdaMargin>=20?3:s.ebitdaMargin>=10?2:0,6);
  add(s.recur?4:1,4);
  add(s.revGrowth>=10?4:s.revGrowth>=6?3:s.revGrowth>=2?2:s.revGrowth>=0?1:0,4);
  add(s.mgmt>=9?6:s.mgmt>=7?4:s.mgmt>=5?2:0,6);
  add(s.moat>=9?6:s.moat>=7?4:s.moat>=5?2:0,6);
  add(s.volM>=500?3:s.volM>=100?2:1,3);
  const pe=s.pe_static; add(pe<=12?5:pe<=18?4:pe<=25?3:pe<=35?2:1,5);
  add(s.pb<=1?4:s.pb<=2?3:s.pb<=4?2:1,4);
  const iv=((s.intrinsic-price)/s.intrinsic)*100;
  add(iv>=20?4:iv>=10?3:iv>=0?2:0,4);
  add(s.debtEq<=0.5?4:s.debtEq<=1.0?3:s.debtEq<=2.0?2:s.debtEq<=3.0?1:0,4);
  add(s.ndEbitda<=1.5?4:s.ndEbitda<=3.0?3:s.ndEbitda<=5.0?2:1,4);
  add(s.rateSens==="low"?2:s.rateSens==="medium"?1:0,2);
  const pct=Math.round((pts/max)*100);
  const CORE=["Banks","Energy","Utilities","Telecom","Pipelines","REITs","Consumer Staples","Healthcare"];
  const approved=dy>=3&&s.streak>=10&&s.fcfPayout<=105&&CORE.includes(s.sector)&&pct>=55&&s.mgmt>=6;
  let grade="D",color=T.red,bg="#fef2f2";
  if(pct>=88){grade="A+";color="#16a34a";bg="#f0fdf4";}
  else if(pct>=74){grade="A";color="#22c55e";bg="#f0fdf4";}
  else if(pct>=60){grade="B+";color=T.amber;bg="#fffbeb";}
  else if(pct>=46){grade="B";color="#f59e0b";bg="#fffbeb";}
  else if(pct>=30){grade="C";color="#ef4444";bg="#fef2f2";}
  const v:Record<string,string>={"A+":"Excellent — Strong Barsi buy","A":"Very Good — Meets Barsi criteria","B+":"Good — Most criteria met","B":"Fair — Monitor for better price","C":"Weak — Missing key criteria","D":"Avoid"};
  return {pct,grade,color,bg,verdict:v[grade]||"",approved,liveDY:+dy.toFixed(2)};
}

function calcSignal(dpa:number,sector:string,price:number) {
  const tgt=TARGET_YIELD[sector]??0.030;
  const fair=dpa/tgt;
  const upside=((fair-price)/price)*100;
  const mos=((fair-price)/fair)*100;
  let status="AVOID",color=T.red,bg="#fef2f2",border="#fca5a5";
  if(upside>=20){status="STRONG BUY";color="#16a34a";bg="#f0fdf4";border="#22c55e";}
  else if(upside>=5){status="BUY";color="#22c55e";bg="#f0fdf4";border="#86efac";}
  else if(upside>=-10){status="HOLD";color=T.amber;bg="#fffbeb";border="#fbbf24";}
  else if(upside>=-25){status="OVERVALUED";color=T.red;bg="#fef2f2";border="#fca5a5";}
  return {status,color,bg,border,fair,upside,mos,tgt:tgt*100,
    zones:{agg:fair,std:fair*0.90,cons:fair*0.80},
    stop:dpa/(tgt*0.6),y3:dpa/0.030,y4:dpa/0.040,y5:dpa/0.050};
}

function project(cap:number,mon:number,dy:number,yrs:number,gr:number) {
  let p=cap,inv=cap;
  return Array.from({length:yrs},(_,i)=>{
    for(let m=0;m<12;m++){p+=mon;inv+=mon;p*=(1+dy/100/12);}
    p*=(1+gr/100);
    return {year:i+1,invested:inv,portfolio:p,annDiv:p*dy/100,monthly:p*dy/100/12};
  });
}

const fd=(n:number,d=2)=>n>=1000?`$${n.toLocaleString("en-US",{maximumFractionDigits:d})}`:`$${Number(n).toFixed(d)}`;
const fPct=(n:number,d=1)=>`${n>=0?"+":""}${n.toFixed(d)}%`;
const fM=(n:number)=>n>=1e9?`$${(n/1e9).toFixed(1)}B`:n>=1e6?`$${(n/1e6).toFixed(0)}M`:`$${Math.round(n).toLocaleString()}`;
const fVol=(n:number)=>n>=1e9?`${(n/1e9).toFixed(2)}B`:n>=1e6?`${(n/1e6).toFixed(1)}M`:`${n.toLocaleString()}`;

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
async function callAI(msgs:{role:string;content:string}[],sys:string) {
  const r=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${SUPABASE_ANON_KEY}`,"apikey":SUPABASE_ANON_KEY},body:JSON.stringify({messages:msgs,system:sys})});
  const d=await r.json();
  if(!r.ok||d.error) throw new Error(d.error||`HTTP ${r.status}`);
  return d.text as string;
}

// ── AUTH ─────────────────────────────────────────────────────
const AuthCtx=createContext<{user:User|null}>({user:null});
function AuthProvider({children}:{children:React.ReactNode}) {
  const [user,setUser]=useState<User|null>(null);
  useEffect(()=>{
    supabase.auth.getSession().then(({data}: any)=>setUser(data.session?.user||null));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_: any,s: any)=>setUser(s?.user||null));
    return()=>subscription.unsubscribe();
  },[]);
  return <AuthCtx.Provider value={{user}}>{children}</AuthCtx.Provider>;
}
const useAuth=()=>useContext(AuthCtx);

function AuthModal({onClose}:{onClose:()=>void}) {
  const [mode,setMode]=useState<"login"|"signup">("login");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState("");
  const submit=async()=>{
    setLoading(true);setMsg("");
    try{
      if(mode==="signup"){const {error}=await supabase.auth.signUp({email,password:pw});if(error)throw error;setMsg("Account created! Check email to confirm.");}
      else{const {error}=await supabase.auth.signInWithPassword({email,password:pw});if(error)throw error;onClose();}
    }catch(e:any){setMsg(e.message);}
    finally{setLoading(false);}
  };
  const inp:React.CSSProperties={width:"100%",padding:"10px 14px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:12};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:20,fontWeight:800,color:T.navy}}>SGC Invest</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:T.muted}}>✕</button>
        </div>
        <input style={inp} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
        <input style={{...inp,marginBottom:20}} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
        {msg&&<div style={{padding:10,borderRadius:8,background:msg.includes("created")?"#f0fdf4":"#fef2f2",color:msg.includes("created")?T.green:T.red,fontSize:13,marginBottom:14}}>{msg}</div>}
        <button style={{width:"100%",padding:12,borderRadius:8,background:T.navy,color:"#fff",border:"none",fontSize:14,fontWeight:700,cursor:"pointer"}} onClick={submit} disabled={loading}>{loading?"Please wait…":mode==="login"?"Sign In":"Create Account"}</button>
        <div style={{textAlign:"center",marginTop:14,fontSize:13,color:T.muted}}>
          {mode==="login"?"No account? ":"Have one? "}
          <span onClick={()=>{setMode(mode==="login"?"signup":"login");setMsg("");}} style={{color:T.navy,fontWeight:700,cursor:"pointer"}}>{mode==="login"?"Create free":"Sign in"}</span>
        </div>
      </div>
    </div>
  );
}

// ── SVG CHART COMPONENTS ─────────────────────────────────────
function CandleChart({bars,overlays}:{bars:Bar[];overlays:string[]}) {
  const W=900,H=280,PAD=8;
  if(!bars.length) return <div style={{height:280,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:13}}>Loading chart data…</div>;
  const src=closes(bars);
  const allH=highs(bars),allL=lows(bars);
  const minP=Math.min(...allL)*0.995,maxP=Math.max(...allH)*1.005,rng=maxP-minP||1;
  const tx=(i:number)=>PAD+(i/(bars.length-1))*(W-2*PAD);
  const ty=(p:number)=>H-((p-minP)/rng)*H;
  const bw=Math.max(1.5,(W-2*PAD)/bars.length*0.6);

  const e20v=ema(src,20),e50v=ema(src,50),e200v=ema(src,200);
  const bbv=bollinger(src);
  const vwapV=vwap(bars);
  const sarV=parabolicSAR(bars);
  const fibV=fib(bars);

  const lpath=(arr:(number|null)[])=>arr.map((v,i)=>v==null?"":`${arr.slice(0,i+1).filter(Boolean).length===1?"M":"L"}${tx(i).toFixed(1)},${ty(v).toFixed(1)}`).join(" ");

  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
      {[0.2,0.4,0.6,0.8].map(f=><line key={f} x1={PAD} y1={H*f} x2={W-PAD} y2={H*f} stroke={T.border} strokeWidth="1"/>)}
      {[0.2,0.4,0.6,0.8].map(f=>{const p=minP+(1-f)*rng;return<text key={f} x={W-PAD+3} y={H*f+4} fontSize="9" fill={T.muted} textAnchor="start">{fd(p)}</text>;})}

      {overlays.includes("fib")&&[
        {v:fibV.r236,c:"#f59e0b",l:"23.6%"},{v:fibV.r382,c:"#ef4444",l:"38.2%"},
        {v:fibV.r500,c:"#8b5cf6",l:"50.0%"},{v:fibV.r618,c:"#e879f9",l:"61.8%"},
      ].map(({v,c,l})=>{const y=ty(v);if(y<0||y>H)return null;return<g key={l}><line x1={PAD} y1={y} x2={W-85} y2={y} stroke={c} strokeWidth="0.8" strokeDasharray="5,4" opacity="0.8"/><text x={W-83} y={y+3} fontSize="8" fill={c}>{l} {fd(v)}</text></g>;})}

      {overlays.includes("bb")&&<>
        <path d={lpath(bbv.upper)} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="4,3" opacity="0.7"/>
        <path d={lpath(bbv.lower)} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="4,3" opacity="0.7"/>
        <path d={lpath(bbv.mid)} fill="none" stroke="#818cf8" strokeWidth="0.5" opacity="0.4"/>
      </>}
      {overlays.includes("vwap")&&<path d={lpath(vwapV)} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="8,4" opacity="0.9"/>}
      {overlays.includes("ema20")&&<path d={lpath(e20v)} fill="none" stroke="#f59e0b" strokeWidth="1.8" opacity="0.9"/>}
      {overlays.includes("ema50")&&<path d={lpath(e50v)} fill="none" stroke="#e879f9" strokeWidth="1.8" opacity="0.9"/>}
      {overlays.includes("ema200")&&<path d={lpath(e200v)} fill="none" stroke="#22c55e" strokeWidth="1.8" opacity="0.9"/>}

      {bars.map((b,i)=>{
        const x=tx(i),o=ty(b.o),c=ty(b.c),hi=ty(b.h),lo=ty(b.l);
        const bull=b.c>=b.o,col=bull?"#16a34a":"#dc2626";
        return<g key={i}>
          <line x1={x} y1={hi} x2={x} y2={lo} stroke={col} strokeWidth="1" opacity="0.7"/>
          <rect x={x-bw/2} y={Math.min(o,c)} width={bw} height={Math.max(Math.abs(o-c),1)} fill={col} opacity="0.85"/>
        </g>;
      })}

      {overlays.includes("sar")&&sarV.map((v,i)=>{const y=ty(v);if(y<0||y>H)return null;return<circle key={i} cx={tx(i)} cy={y} r="1.8" fill={bars[i].c>=v?"#22c55e":"#ef4444"} opacity="0.8"/>;})}
    </svg>
  );
}

function OscChart({bars,type}:{bars:Bar[];type:string}) {
  const W=900,H=80;
  const src=closes(bars);
  const tx=(i:number,len:number)=>(i/(len-1))*W;
  const lpath=(arr:number[],mn:number,mx:number)=>arr.map((v,i)=>`${i===0?"M":"L"}${tx(i,arr.length).toFixed(1)},${H-((v-mn)/(mx-mn||1))*H}`).join(" ");

  if(type==="macd"){
    const {line,signal,hist}=macd(src);
    const all=[...line,...signal,...hist];
    const mn=Math.min(...all),mx=Math.max(...all);
    const zero=H-((0-mn)/(mx-mn||1))*H;
    return<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
      <line x1={0} y1={zero} x2={W} y2={zero} stroke={T.border} strokeWidth="1"/>
      {hist.map((v,i)=>{const bw2=Math.max(1,W/hist.length-0.5),bh=Math.abs(H-((0-mn)/(mx-mn||1))*H-(H-((v-mn)/(mx-mn||1))*H)),by=v>=0?H-((v-mn)/(mx-mn||1))*H:zero;return<rect key={i} x={tx(i,hist.length)-bw2/2} y={by} width={bw2} height={bh} fill={v>=0?"#16a34a55":"#dc262655"}/>;}) }
      <path d={lpath(line,mn,mx)} fill="none" stroke="#1e40af" strokeWidth="1.8"/>
      <path d={lpath(signal,mn,mx)} fill="none" stroke="#f59e0b" strokeWidth="1.8"/>
    </svg>;
  }
  if(type==="rsi"){
    const vals=rsi(src,14);
    const ty2=(v:number)=>H-(v/100)*H;
    return<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
      <rect x={0} y={ty2(70)} width={W} height={ty2(30)-ty2(70)} fill="#f1f5f9"/>
      <line x1={0} y1={ty2(70)} x2={W} y2={ty2(70)} stroke="#dc2626" strokeWidth="0.8" strokeDasharray="4,4"/>
      <line x1={0} y1={ty2(50)} x2={W} y2={ty2(50)} stroke={T.border} strokeWidth="0.8"/>
      <line x1={0} y1={ty2(30)} x2={W} y2={ty2(30)} stroke="#16a34a" strokeWidth="0.8" strokeDasharray="4,4"/>
      <text x={4} y={ty2(70)-3} fontSize="9" fill="#dc2626">70</text>
      <text x={4} y={ty2(30)+11} fontSize="9" fill="#16a34a">30</text>
      <path d={vals.map((v,i)=>`${i===0?"M":"L"}${tx(i,vals.length).toFixed(1)},${ty2(v).toFixed(1)}`).join(" ")} fill="none" stroke="#7c3aed" strokeWidth="2"/>
    </svg>;
  }
  if(type==="stoch"){
    const st=stochastic(bars);
    const ty2=(v:number)=>H-(v/100)*H;
    return<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
      <line x1={0} y1={ty2(80)} x2={W} y2={ty2(80)} stroke="#dc2626" strokeWidth="0.8" strokeDasharray="4,4"/>
      <line x1={0} y1={ty2(20)} x2={W} y2={ty2(20)} stroke="#16a34a" strokeWidth="0.8" strokeDasharray="4,4"/>
      <path d={st.k.map((v,i)=>`${i===0?"M":"L"}${tx(i,st.k.length).toFixed(1)},${ty2(v).toFixed(1)}`).join(" ")} fill="none" stroke="#1e40af" strokeWidth="1.8"/>
      <path d={st.d.map((v,i)=>`${i===0?"M":"L"}${tx(i,st.d.length).toFixed(1)},${ty2(v).toFixed(1)}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="1.8"/>
    </svg>;
  }
  if(type==="adx"){
    const a=adx(bars);
    const ty2=(v:number)=>H-(Math.min(v,100)/100)*H;
    return<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
      <line x1={0} y1={ty2(25)} x2={W} y2={ty2(25)} stroke={T.amber} strokeWidth="0.8" strokeDasharray="4,4"/>
      <text x={4} y={ty2(25)-3} fontSize="9" fill={T.amber}>25 (trend threshold)</text>
      <path d={a.adx.map((v,i)=>`${i===0?"M":"L"}${tx(i,a.adx.length).toFixed(1)},${ty2(v).toFixed(1)}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="2"/>
      <path d={a.pdi.map((v,i)=>`${i===0?"M":"L"}${tx(i,a.pdi.length).toFixed(1)},${ty2(v).toFixed(1)}`).join(" ")} fill="none" stroke="#16a34a" strokeWidth="1.2"/>
      <path d={a.ndi.map((v,i)=>`${i===0?"M":"L"}${tx(i,a.ndi.length).toFixed(1)},${ty2(v).toFixed(1)}`).join(" ")} fill="none" stroke="#dc2626" strokeWidth="1.2"/>
    </svg>;
  }
  return null;
}

function VolumeChart({bars}:{bars:Bar[]}) {
  const W=900,H=45;
  if(!bars.length) return null;
  const maxV=Math.max(...bars.map(b=>b.v));
  const bw=Math.max(1,(W/bars.length)*0.8);
  return<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
    {bars.map((b,i)=>{const bh=(b.v/maxV)*H,x=(i/(bars.length-1))*W;return<rect key={i} x={x-bw/2} y={H-bh} width={bw} height={bh} fill={b.c>=b.o?"#16a34a44":"#dc262644"}/>;}) }
  </svg>;
}

function ProjChart({data}:{data:any[]}) {
  if(!data.length)return null;
  const W=500,H=110,maxV=data[data.length-1].portfolio;
  const tx=(i:number)=>(i/(data.length-1))*W;
  const ty=(v:number)=>H-(v/maxV)*H;
  const pp=data.map((d,i)=>`${i===0?"M":"L"}${tx(i).toFixed(0)},${ty(d.portfolio).toFixed(0)}`).join(" ");
  const ip=data.map((d,i)=>`${i===0?"M":"L"}${tx(i).toFixed(0)},${ty(d.invested).toFixed(0)}`).join(" ");
  const dp=data.map((d,i)=>`${i===0?"M":"L"}${tx(i).toFixed(0)},${ty(d.annDiv).toFixed(0)}`).join(" ");
  return<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
    <defs><linearGradient id="pg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.navy} stopOpacity="0.18"/><stop offset="100%" stopColor={T.navy} stopOpacity="0.01"/></linearGradient></defs>
    {[0.25,0.5,0.75].map(f=><line key={f} x1={0} y1={H*f} x2={W} y2={H*f} stroke={T.border} strokeWidth="1"/>)}
    <path d={pp+` L${W},${H} L0,${H} Z`} fill="url(#pg3)"/>
    <path d={pp} fill="none" stroke={T.navy} strokeWidth="2.5"/>
    <path d={ip} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,4"/>
    <path d={dp} fill="none" stroke={T.gold} strokeWidth="2"/>
  </svg>;
}

function DYBars({values,color}:{values:readonly number[];color:string}) {
  const mx=Math.max(...values)*1.2||1;
  return<div style={{display:"flex",alignItems:"flex-end",gap:3,height:52}}>
    {values.map((v,i)=>(
      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <span style={{fontSize:8,color:T.muted,fontWeight:600}}>{v.toFixed(1)}</span>
        <div style={{width:"100%",height:`${(v/mx)*32}px`,background:v>=3?color+"bb":"#fca5a5",borderRadius:"2px 2px 0 0",minHeight:3}}/>
        <span style={{fontSize:8,color:T.muted}}>{["'21","'22","'23","'24","'25"][i]}</span>
      </div>
    ))}
  </div>;
}

function ScoreGauge({pct,grade,color}:{pct:number;grade:string;color:string}) {
  const R=40,cx=48,cy=52,sweep=(pct/100)*Math.PI;
  const x1=cx+R*Math.cos(Math.PI),y1=cy+R*Math.sin(Math.PI);
  const x2=cx+R*Math.cos(Math.PI+sweep),y2=cy+R*Math.sin(Math.PI+sweep);
  return<svg width={96} height={60} style={{overflow:"visible"}}>
    <path d={`M${x1},${y1} A${R},${R} 0 1,1 ${cx+R},${cy}`} fill="none" stroke={T.border} strokeWidth="7" strokeLinecap="round"/>
    <path d={`M${x1},${y1} A${R},${R} 0 ${sweep>Math.PI/2?1:0},1 ${x2.toFixed(2)},${y2.toFixed(2)}`} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"/>
    <text x={cx} y={cy-8} textAnchor="middle" fontSize="18" fontWeight="800" fill={color} fontFamily="Inter,sans-serif">{pct}</text>
    <text x={cx} y={cy+6} textAnchor="middle" fontSize="12" fontWeight="700" fill={color} fontFamily="Inter,sans-serif">{grade}</text>
  </svg>;
}

function TaxCalc() {
  const [country,setCountry]=useState<"US"|"CA">("US");
  const [income,setIncome]=useState(80000);
  const [qualDiv,setQualDiv]=useState(3000);
  const [ordDiv,setOrdDiv]=useState(500);
  const usQDRate=income<=47025?0:income<=518900?0.15:0.20;
  const usOrdRate=income<=44725?0.10:income<=95375?0.12:income<=201050?0.22:0.24;
  const inp2:React.CSSProperties={width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:12};
  const card:React.CSSProperties={background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:14,boxShadow:T.shadow};
  const row:React.CSSProperties={display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`,fontSize:13};
  return<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
    <div style={card}>
      <div style={{fontSize:15,fontWeight:800,color:T.navy,marginBottom:16}}>💰 Dividend Tax Calculator</div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {(["US","CA"] as const).map(c=><button key={c} onClick={()=>setCountry(c)} style={{flex:1,padding:"9px",borderRadius:8,border:`1px solid ${country===c?T.navy:T.border}`,background:country===c?T.navy:"#fff",color:country===c?"#fff":T.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{c==="US"?"🇺🇸 United States":"🇨🇦 Canada"}</button>)}
      </div>
      <label style={{fontSize:11,color:T.muted,fontWeight:700,display:"block",marginBottom:5}}>Annual Taxable Income</label>
      <input style={inp2} type="number" value={income} onChange={e=>setIncome(+e.target.value)}/>
      {country==="US"?<>
        <label style={{fontSize:11,color:T.muted,fontWeight:700,display:"block",marginBottom:5}}>Qualified Dividends (most US & CA stocks)</label>
        <input style={inp2} type="number" value={qualDiv} onChange={e=>setQualDiv(+e.target.value)}/>
        <div style={{fontSize:11,color:T.green,marginBottom:12}}>✓ Taxed at 0/15/20% — much lower than ordinary income</div>
        <label style={{fontSize:11,color:T.muted,fontWeight:700,display:"block",marginBottom:5}}>Ordinary Dividends (REITs, foreign)</label>
        <input style={{...inp2,marginBottom:0}} type="number" value={ordDiv} onChange={e=>setOrdDiv(+e.target.value)}/>
      </>:<>
        <label style={{fontSize:11,color:T.muted,fontWeight:700,display:"block",marginBottom:5}}>Eligible Dividends from Canadian corporations</label>
        <input style={{...inp2,marginBottom:0}} type="number" value={qualDiv} onChange={e=>setQualDiv(+e.target.value)}/>
        <div style={{fontSize:11,color:T.green,marginTop:8}}>✓ Dividend Tax Credit — ~9.5% effective rate for most Canadians</div>
      </>}
    </div>
    <div>
      <div style={card}>
        <div style={{fontSize:15,fontWeight:800,color:T.navy,marginBottom:14}}>📋 Tax Summary</div>
        {country==="US"?<>
          <div style={row}><span style={{color:T.muted}}>Qualified dividend rate</span><span style={{color:T.green,fontWeight:700}}>{(usQDRate*100).toFixed(0)}%</span></div>
          <div style={row}><span style={{color:T.muted}}>Tax on qualified dividends</span><span style={{fontWeight:700}}>${(qualDiv*usQDRate).toFixed(0)}</span></div>
          <div style={row}><span style={{color:T.muted}}>Tax on ordinary dividends ({(usOrdRate*100).toFixed(0)}%)</span><span style={{color:T.amber,fontWeight:700}}>${(ordDiv*usOrdRate).toFixed(0)}</span></div>
          <div style={{...row,borderBottom:"none",paddingTop:12}}><span style={{fontWeight:800}}>Total estimated tax</span><span style={{fontWeight:800,color:T.red,fontSize:16}}>${((qualDiv*usQDRate)+(ordDiv*usOrdRate)).toFixed(0)}</span></div>
          <div style={{marginTop:12,padding:"10px",background:"#f0fdf4",borderRadius:8,fontSize:12,color:T.green}}>💡 <strong>Roth IRA:</strong> All dividend income and growth is tax-free forever. Max $7,000/yr (2025).</div>
        </>:<>
          <div style={row}><span style={{color:T.muted}}>Gross-up (38%)</span><span style={{fontWeight:700}}>${(qualDiv*1.38).toFixed(0)} CAD</span></div>
          <div style={row}><span style={{color:T.muted}}>Dividend Tax Credit (15.02%)</span><span style={{color:T.green,fontWeight:700}}>−${(qualDiv*1.38*0.1502).toFixed(0)} CAD</span></div>
          <div style={{...row,borderBottom:"none",paddingTop:12}}><span style={{fontWeight:800}}>Effective rate</span><span style={{fontWeight:800,color:T.amber,fontSize:16}}>~9.5%</span></div>
          <div style={{marginTop:12,padding:"10px",background:"#f0fdf4",borderRadius:8,fontSize:12,color:T.green}}>💡 <strong>TFSA:</strong> Canadian dividends are completely tax-free — the ideal Barsi account.</div>
        </>}
      </div>
      <div style={{...card,background:"#fffbeb",border:`1px solid ${T.gold}50`}}>
        <div style={{fontSize:13,fontWeight:700,color:T.amber,marginBottom:10}}>💡 Why Dividends Beat Interest (After Tax)</div>
        {[{l:"Qualified US/CA dividends",v:"0–20% federal",c:T.green},{l:"Roth IRA dividends",v:"0% forever",c:T.green},{l:"TFSA dividends (CA)",v:"0% forever",c:T.green},{l:"Bank CD / bond interest",v:"10–37% ordinary",c:T.red},{l:"Non-qualified dividends",v:"10–37% ordinary",c:T.red}].map(r=>(
          <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
            <span>{r.l}</span><span style={{fontWeight:700,color:r.c}}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

// ── MAIN APP ─────────────────────────────────────────────────
type Tab="scanner"|"analysis"|"technical"|"portfolio"|"projector"|"tax"|"education"|"ai";

function SGCApp() {
  const {user}=useAuth();
  const [tab,setTab]=useState<Tab>("scanner");
  const [showAuth,setShowAuth]=useState(false);

  // Live prices map: sym -> quote
  const [quotes,setQuotes]=useState<Record<string,any>>({});
  const [quoteLoading,setQuoteLoading]=useState(true);
  const [lastUpdate,setLastUpdate]=useState<Date|null>(null);

  // Bars for charts
  const [bars,setBars]=useState<Record<string,Bar[]>>({});
  const [barsLoading,setBarsLoading]=useState(false);

  const [sel,setSel]=useState(STOCKS_BASE[0]);
  const [fSec,setFSec]=useState("All");
  const [fCtry,setFCtry]=useState("All");
  const [fSig,setFSig]=useState("All");
  const [fApproved,setFApproved]=useState(false);
  const [sortK,setSortK]=useState("score");
  const [srch,setSrch]=useState("");

  // Technical chart state
  const [overlays,setOvls]=useState(["ema20","ema50","bb","vwap"]);
  const [oscType,setOscType]=useState("macd");
  const [chartRange,setChartRange]=useState("6mo");

  // Portfolio
  const [port,setPort]=useState([
    {sym:"JNJ",qty:50,avg:152.40},{sym:"O",qty:200,avg:52.10},
    {sym:"ENB",qty:300,avg:34.20},{sym:"KO",qty:100,avg:62.80},{sym:"VZ",qty:150,avg:38.40},
  ]);
  const [pForm,setPForm]=useState({sym:"",qty:"",avg:""});

  // Projector
  const [pCap,setPCap]=useState(50000);
  const [pMon,setPMon]=useState(1000);
  const [pDY,setPDY]=useState(4.5);
  const [pYrs,setPYrs]=useState(25);
  const [pGrw,setPGrw]=useState(3);

  // AI
  const [chat,setChat]=useState<{role:string;content:string}[]>([]);
  const [chatIn,setChatIn]=useState("");
  const [chatLoad,setChatLoad]=useState(false);
  const [aiText,setAiText]=useState("");
  const [aiLoad,setAiLoad]=useState(false);
  const [aiErr,setAiErr]=useState("");
  const chatEnd=useRef<HTMLDivElement>(null);

  // ── FETCH LIVE QUOTES (all 24 at once, staggered) ──────────
  const fetchAllQuotes=useCallback(async()=>{
    setQuoteLoading(true);
    const results:Record<string,any>={};
    // Fetch in batches of 4 to avoid rate limits
    const syms=STOCKS_BASE.map(s=>s.yahooSym);
    for(let i=0;i<syms.length;i+=4) {
      const batch=syms.slice(i,i+4);
      await Promise.all(batch.map(async sym=>{
        const q=await fetchQuote(sym);
        if(q) results[sym]=q;
      }));
      if(i+4<syms.length) await new Promise(r=>setTimeout(r,300));
    }
    setQuotes(results);
    setQuoteLoading(false);
    setLastUpdate(new Date());
  },[]);

  useEffect(()=>{
    fetchAllQuotes();
    const t=setInterval(fetchAllQuotes,90000); // refresh every 90s
    return()=>clearInterval(t);
  },[fetchAllQuotes]);

  // ── FETCH BARS FOR SELECTED STOCK ──────────────────────────
  useEffect(()=>{
    if(!sel) return;
    if(bars[sel.yahooSym+chartRange]) return; // already loaded
    setBarsLoading(true);
    fetchBars(sel.yahooSym,chartRange).then(b=>{
      setBars(prev=>({...prev,[sel.yahooSym+chartRange]:b}));
      setBarsLoading(false);
    });
  },[sel,chartRange]);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[chat]);

  // Get current price with live fallback
  const getPrice=(s:typeof STOCKS_BASE[number])=>{
    const q=quotes[s.yahooSym];
    return q?.price||0;
  };
  const getChg=(s:typeof STOCKS_BASE[number])=>quotes[s.yahooSym]?.chgPct||0;
  const getLiveDY=(s:typeof STOCKS_BASE[number])=>{
    const p=getPrice(s);
    return p?+(s.dpa/p*100).toFixed(2):0;
  };

  const scores=useMemo(()=>Object.fromEntries(STOCKS_BASE.map(s=>[s.sym,calcBarsiScore(s,getPrice(s))])),[quotes]);
  const signals=useMemo(()=>Object.fromEntries(STOCKS_BASE.map(s=>[s.sym,calcSignal(s.dpa,s.sector,getPrice(s))])),[quotes]);

  const selBars=bars[sel.yahooSym+chartRange]||[];
  const techAnalysis=useMemo(()=>selBars.length>20?runTechSignals(selBars):null,[selBars]);

  const filtered=useMemo(()=>[...STOCKS_BASE]
    .filter(s=>fSec==="All"||(s.sector as string)===fSec)
    .filter(s=>fCtry==="All"||(s.country as string)===fCtry)
    .filter(s=>!fApproved||scores[s.sym]?.approved)
    .filter(s=>fSig==="All"||signals[s.sym]?.status===fSig)
    .filter(s=>!srch||s.sym.includes(srch.toUpperCase())||s.name.toLowerCase().includes(srch.toLowerCase()))
    .sort((a,b)=>{
      if(sortK==="score")return scores[b.sym].pct-scores[a.sym].pct;
      if(sortK==="dy")return getLiveDY(b)-getLiveDY(a);
      if(sortK==="streak")return b.streak-a.streak;
      if(sortK==="upside")return signals[b.sym].upside-signals[a.sym].upside;
      if(sortK==="fcf")return b.fcfYield-a.fcfYield;
      return 0;
    }),[fSec,fCtry,fSig,fApproved,sortK,srch,scores,signals,quotes]);

  const portRows=useMemo(()=>port.map(p=>{
    const s=STOCKS_BASE.find(x=>x.sym===p.sym);if(!s)return null;
    const price=getPrice(s)||p.avg;
    const val=price*p.qty,cost=p.avg*p.qty;
    return{...p,s,price,val,cost,gain:val-cost,gainPct:((val-cost)/cost)*100,annDiv:val*getLiveDY(s)/100,sig:signals[s.sym],sc:scores[s.sym]};
  }).filter(Boolean) as any[],[port,signals,scores,quotes]);

  const portTot=useMemo(()=>{
    const val=portRows.reduce((a:number,r:any)=>a+r.val,0);
    const cost=portRows.reduce((a:number,r:any)=>a+r.cost,0);
    const div=portRows.reduce((a:number,r:any)=>a+r.annDiv,0);
    return{val,cost,gain:val-cost,gainPct:cost?((val-cost)/cost)*100:0,div,monthly:div/12,avgDY:val?div/val*100:0};
  },[portRows]);

  const projData=useMemo(()=>project(pCap,pMon,pDY,pYrs,pGrw),[pCap,pMon,pDY,pYrs,pGrw]);
  const projFinal=projData[projData.length-1];

  const selectStock=(s:typeof STOCKS_BASE[number],nextTab:Tab="analysis")=>{
    setSel(s);setAiText("");setAiErr("");setTab(nextTab);
    // Pre-fetch bars
    if(!bars[s.yahooSym+chartRange]){
      setBarsLoading(true);
      fetchBars(s.yahooSym,chartRange).then(b=>{
        setBars(prev=>({...prev,[s.yahooSym+chartRange]:b}));
        setBarsLoading(false);
      });
    }
  };

  const analyzeStock=async(s:typeof STOCKS_BASE[number])=>{
    setAiText("");setAiErr("");setAiLoad(true);
    const sc=scores[s.sym],sig=signals[s.sym];
    const price=getPrice(s),dy=getLiveDY(s);
    const tech=techAnalysis;
    const prompt=`You are a senior analyst combining Barsi's 21-criterion dividend methodology with technical analysis.

STOCK: ${s.name} (${s.sym}) | ${s.sector} | ${s.country}
LIVE PRICE: ${fd(price)} | DPS: $${s.dpa}/yr | LIVE YIELD: ${dy.toFixed(2)}%
STREAK: ${s.streak} years | FCF PAYOUT: ${s.fcfPayout}% | FCF YIELD: ${s.fcfYield}%
ROE: ${s.roe}% | P/E: ${s.pe_static}x | MOAT: ${s.moat}/10 | MGMT: ${s.mgmt}/10

BARSI SCORE: ${sc.pct}/100 → ${sc.grade} — ${sc.verdict}
BARSI APPROVED: ${sc.approved?"YES":"NO"}
BUY SIGNAL: ${sig.status} | Fair Value: ${fd(sig.fair)} | Upside: ${fPct(sig.upside)}
Entry Zones: Aggressive ${fd(sig.zones.agg)}, Standard ${fd(sig.zones.std)}, Conservative ${fd(sig.zones.cons)}

${tech?`TECHNICAL ANALYSIS (${selBars.length} bars):
Composite Score: ${tech.score}/100 → ${tech.label}
${tech.votes.map(v=>`• ${v.name}: ${v.signal} — ${v.detail}`).join("\n")}
Trade Setup: ${tech.setup.side} | Entry ${fd(tech.setup.entry)} | Stop ${fd(tech.setup.stop)} | Target ${fd(tech.setup.target)} | R:R 1:${tech.setup.rr}`:"No chart data loaded yet."}

Write EXACTLY these sections:
📊 COMPANY OVERVIEW
💰 BARSI DIVIDEND ANALYSIS (FCF coverage, sustainability, growth trajectory)
🎯 BUY SIGNAL: ${sig.status} — PRICE ANALYSIS
📈 TECHNICAL PICTURE (trend, momentum, key levels, timing)
⚡ CONFLUENCE ANALYSIS (where fundamental + technical signals agree or disagree)
🛒 HOW TO BUY (entry zones, position sizing, DCA approach)
📆 INCOME PROJECTION ($10K/$50K/$100K — 5,10,20 years)
⚠️ TOP 3 RISKS for ${s.sym}
🏁 VERDICT (clear: buy/hold/avoid + price targets)
⚠️ DISCLAIMER: Educational only. Not investment advice. DYOR.`;
    try{const t=await callAI([{role:"user",content:prompt}],"Professional dividend + technical analyst. Be specific with price levels. English only.");setAiText(t);}
    catch(e:any){setAiErr(`AI Error: ${e.message}. Check edge function "sgc-ai" is deployed.`);}
    finally{setAiLoad(false);}
  };

  const sendChat=async()=>{
    if(!chatIn.trim()||chatLoad)return;
    const msg=chatIn.trim();setChatIn("");
    const nc=[...chat,{role:"user",content:msg}];
    setChat(nc);setChatLoad(true);
    const top=STOCKS_BASE.slice(0,10).map(s=>`${s.sym}:${fd(getPrice(s))},DY${getLiveDY(s).toFixed(1)}%,${signals[s.sym]?.status},Score${scores[s.sym]?.pct}`).join("|");
    try{
      const r=await callAI(nc,`You are SGC Invest's AI advisor. Expert in Barsi 21-criterion methodology AND technical analysis. Live data: ${top}. End with: ⚠️ Not investment advice. DYOR.`);
      setChat(c=>[...c,{role:"assistant",content:r}]);
    }catch(e:any){setChat(c=>[...c,{role:"assistant",content:`⚠ Error: ${e.message}`}]);}
    finally{setChatLoad(false);}
  };

  const toggleOvl=(o:string)=>setOvls(prev=>prev.includes(o)?prev.filter(x=>x!==o):[...prev,o]);

  const buyCount=Object.values(signals).filter((s:any)=>s.status==="BUY"||s.status==="STRONG BUY").length;
  const approvedCount=Object.values(scores).filter((s:any)=>s.approved).length;

  const G={
    card:{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:14,boxShadow:T.shadow} as React.CSSProperties,
    lbl:{fontSize:11,color:T.muted,letterSpacing:1.2,fontWeight:700,marginBottom:10,display:"block",textTransform:"uppercase" as const},
    TH:{fontSize:11,color:T.muted,fontWeight:700,padding:"10px 12px",textAlign:"left" as const,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap" as const,background:"#f8faff"},
    TD:{padding:"11px 12px",fontSize:13,verticalAlign:"middle" as const,borderBottom:`1px solid ${T.light}`},
    inp:{background:"#fff",border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"} as React.CSSProperties,
    btn:(bg=T.navy)=>({background:bg,border:"none",color:"#fff",padding:"9px 18px",borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700}),
    pill:(a:boolean)=>({padding:"10px 18px",fontSize:12,fontWeight:700,border:"none",cursor:"pointer",background:a?T.navy:"transparent",color:a?"#fff":T.muted,borderBottom:a?`3px solid ${T.gold}`:"3px solid transparent",whiteSpace:"nowrap" as const,fontFamily:"inherit",transition:"all .2s"}),
    ovlBtn:(a:boolean)=>({padding:"5px 10px",borderRadius:5,border:`1px solid ${a?T.navy:T.border}`,background:a?T.navy:"#fff",color:a?"#fff":T.muted,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}),
    sig:(s:any)=>({display:"inline-block",padding:"4px 10px",borderRadius:6,background:s.bg,color:s.color,border:`1px solid ${s.border}`,fontSize:10,fontWeight:800,whiteSpace:"nowrap" as const}),
    kpi:{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",textAlign:"center" as const,boxShadow:T.shadow},
  };

  const TABS:([Tab,string][])=[
    ["scanner","🔍 Scanner"],["analysis","📊 Fundamentals"],["technical","📈 Technical"],
    ["portfolio","💼 Portfolio"],["projector","💎 Wealth Engine"],
    ["tax","💸 Tax Guide"],["education","📚 Barsi Method"],["ai","🤖 AI Advisor"],
  ];

  const sectors=[...new Set(STOCKS_BASE.map(s=>s.sector))].sort();
  const livePrice=getPrice(sel);
  const selSc=scores[sel.sym]||{pct:0,grade:"D",color:T.red,bg:"#fef2f2",verdict:"",approved:false,liveDY:0};
  const selSig=signals[sel.sym]||calcSignal(sel.dpa,sel.sector,sel.intrinsic);
  const ivGap=livePrice?((sel.intrinsic-livePrice)/sel.intrinsic)*100:0;

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"'Inter','Segoe UI',sans-serif",color:T.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box} button:hover{opacity:.88} input:focus{border-color:${T.navy}!important;box-shadow:0 0 0 3px ${T.navy}15!important;outline:none}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:2px}
        @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}} tr:hover td{background:#f8faff!important}
      `}</style>

      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,${T.navyD},${T.navy})`,color:"#fff",padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:62,boxShadow:"0 2px 16px rgba(26,58,143,0.35)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:40,height:40,borderRadius:9,background:"rgba(255,255,255,0.13)",border:"1px solid rgba(255,255,255,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900}}>SGC</div>
          <div>
            <div style={{fontWeight:900,fontSize:18}}>SGC Invest</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",letterSpacing:1.5}}>LIVE PRICES · BARSI 21 CRITERIA · TECHNICAL ANALYSIS · sgcbuilt.com</div>
          </div>
        </div>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <LiveDate />
          <div style={{display:"flex",gap:16,fontSize:12,color:"rgba(255,255,255,0.7)"}}>
            <span style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:quoteLoading?"#f59e0b":"#22c55e",animation:"pulse 2s infinite",display:"inline-block"}}/>
              {quoteLoading?"Fetching prices…":lastUpdate?`Live · ${lastUpdate.toLocaleTimeString()}`:"–"}
            </span>
            <span style={{color:"#e8c66e"}}>⭐ {approvedCount} approved</span>
            <span style={{color:"#86efac"}}>🟢 {buyCount} buy signals</span>
          </div>
          <button onClick={fetchAllQuotes} style={{...G.btn("rgba(255,255,255,0.12)"),border:"1px solid rgba(255,255,255,0.2)",fontSize:11,padding:"6px 12px"}}>🔄 Refresh</button>
          {user
            ?<button onClick={()=>supabase.auth.signOut()} style={{...G.btn("rgba(255,255,255,0.12)"),border:"1px solid rgba(255,255,255,0.2)",fontSize:11,padding:"6px 12px"}}>Sign Out</button>
            :<button onClick={()=>setShowAuth(true)} style={{...G.btn(T.gold),color:T.navyD,fontSize:12,padding:"8px 18px"}}>Sign In</button>}
        </div>

      </div>

      {/* TABS */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,display:"flex",overflowX:"auto",paddingLeft:16}}>
        {TABS.map(([id,lbl])=><button key={id} style={G.pill(tab===id)} onClick={()=>setTab(id)}>{lbl}</button>)}
      </div>

      <div style={{padding:"20px 24px",maxWidth:1500,margin:"0 auto"}}>

        {/* ══ SCANNER ══ */}
        {tab==="scanner"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            {quoteLoading&&<div style={{...G.card,textAlign:"center",padding:14,background:"#fffbeb",border:`1px solid ${T.gold}`}}><span style={{fontSize:13,color:T.amber}}>⏳ Fetching live prices from Yahoo Finance for all 24 stocks…</span></div>}
            <div style={{...G.card,display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end",padding:"16px 20px"}}>
              <div style={{flex:1,minWidth:160}}>
                <label style={G.lbl}>Search</label>
                <input style={{...G.inp,width:"100%"}} placeholder="Symbol or name…" value={srch} onChange={e=>setSrch(e.target.value)}/>
              </div>
              <div>
                <label style={G.lbl}>Country</label>
                <div style={{display:"flex",gap:5}}>
                  {["All","US","CA"].map(c=><button key={c} onClick={()=>setFCtry(c)} style={{padding:"7px 13px",borderRadius:6,border:`1px solid ${fCtry===c?T.navy:T.border}`,background:fCtry===c?T.navy:"#fff",color:fCtry===c?"#fff":T.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{c==="US"?"🇺🇸 US":c==="CA"?"🇨🇦 CA":"All"}</button>)}
                </div>
              </div>
              <div>
                <label style={G.lbl}>Sector</label>
                <select value={fSec} onChange={e=>setFSec(e.target.value)} style={{...G.inp,fontSize:12}}>
                  <option value="All">All Sectors</option>
                  {sectors.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={G.lbl}>Signal</label>
                <select value={fSig} onChange={e=>setFSig(e.target.value)} style={{...G.inp,fontSize:12}}>
                  {["All","STRONG BUY","BUY","HOLD","OVERVALUED","AVOID"].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={G.lbl}>Sort</label>
                <select value={sortK} onChange={e=>setSortK(e.target.value)} style={{...G.inp,fontSize:12}}>
                  <option value="score">Barsi Score ↓</option>
                  <option value="dy">Live Yield ↓</option>
                  <option value="streak">Streak ↓</option>
                  <option value="upside">Upside ↓</option>
                  <option value="fcf">FCF Yield ↓</option>
                </select>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",paddingBottom:2}}>
                <input type="checkbox" checked={fApproved} onChange={e=>setFApproved(e.target.checked)} style={{accentColor:T.navy,width:15,height:15}}/>
                Barsi approved
              </label>
              <span style={{fontSize:12,color:T.muted,paddingBottom:2}}>{filtered.length} stocks</span>
            </div>
            <div style={{...G.card,padding:0,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:1400}}>
                  <thead>
                    <tr>{["","SYMBOL","SECTOR","","LIVE PRICE","CHG","LIVE DY%","5yr DY","STREAK","FCF YLD","FCF PAY","MOAT","MGMT","UPSIDE","FAIR VALUE","SIGNAL","SCORE","GRADE",""].map((h,i)=><th key={i} style={G.TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.map(s=>{
                      const sc=scores[s.sym],sig=signals[s.sym];
                      const price=getPrice(s),chg=getChg(s),dy=getLiveDY(s);
                      return(
                        <tr key={s.sym} style={{cursor:"pointer"}} onClick={()=>selectStock(s,"analysis")}>
                          <td style={G.TD}><div style={{width:32,height:32,borderRadius:7,background:SEC_BG[s.sector],color:SEC_COLOR[s.sector],display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800}}>{s.abbr}</div></td>
                          <td style={G.TD}><div style={{fontWeight:700}}>{s.sym}</div><div style={{fontSize:11,color:T.muted,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div></td>
                          <td style={G.TD}><span style={{background:SEC_BG[s.sector],color:SEC_COLOR[s.sector],borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{s.sector}</span></td>
                          <td style={G.TD}><span style={{fontSize:18}}>{s.country==="US"?"🇺🇸":"🇨🇦"}</span></td>
                          <td style={{...G.TD,fontWeight:800,fontSize:14}}>
                            {price?fd(price):<span style={{color:T.muted,fontSize:11}}>–</span>}
                            {quoteLoading&&<span style={{marginLeft:5,fontSize:10,animation:"spin 1s linear infinite",display:"inline-block",color:T.amber}}>◈</span>}
                          </td>
                          <td style={{...G.TD,color:chg>=0?T.green:T.red,fontWeight:700}}>{price?fPct(chg):"–"}</td>
                          <td style={{...G.TD,fontWeight:800,fontSize:15,color:dy>=5?T.green:dy>=3?T.amber:T.red}}>{price?`${dy.toFixed(2)}%`:"–"}</td>
                          <td style={G.TD}><DYBars values={s.dy5y} color={T.navy}/></td>
                          <td style={{...G.TD,fontWeight:700,color:s.streak>=25?T.green:s.streak>=10?T.amber:T.muted}}>{s.streak}yr</td>
                          <td style={{...G.TD,color:s.fcfYield>=6?T.green:s.fcfYield>=4?T.amber:T.red,fontWeight:600}}>{s.fcfYield}%</td>
                          <td style={{...G.TD,color:s.fcfPayout<=70?T.green:s.fcfPayout<=100?T.amber:T.red}}>{s.fcfPayout}%</td>
                          <td style={{...G.TD,color:s.moat>=8?T.green:s.moat>=6?T.amber:T.red,fontWeight:600}}>{s.moat}/10</td>
                          <td style={{...G.TD,color:s.mgmt>=8?T.green:s.mgmt>=6?T.amber:T.red,fontWeight:600}}>{s.mgmt}/10</td>
                          <td style={{...G.TD,fontWeight:700,color:sig.upside>=0?T.green:T.red}}>{price?fPct(sig.upside):"–"}</td>
                          <td style={{...G.TD,fontWeight:700,color:T.navy}}>{fd(sig.fair)}</td>
                          <td style={G.TD}><span style={G.sig(sig)}>{sig.status}</span></td>
                          <td style={G.TD}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <div style={{width:42,height:5,borderRadius:3,background:T.border,overflow:"hidden"}}><div style={{height:"100%",width:`${sc.pct}%`,background:sc.color,borderRadius:3}}/></div>
                              <span style={{color:sc.color,fontWeight:800}}>{sc.pct}</span>
                            </div>
                          </td>
                          <td style={G.TD}><span style={{background:sc.bg,color:sc.color,border:`1px solid ${sc.color}40`,borderRadius:5,padding:"4px 9px",fontSize:13,fontWeight:800}}>{sc.grade}</span></td>
                          <td style={G.TD}>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={e=>{e.stopPropagation();selectStock(s,"analysis");}} style={{...G.btn(),padding:"5px 10px",fontSize:10}}>Barsi</button>
                              <button onClick={e=>{e.stopPropagation();selectStock(s,"technical");}} style={{...G.btn("#7c3aed"),padding:"5px 10px",fontSize:10}}>Tech</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ FUNDAMENTALS ANALYSIS ══ */}
        {tab==="analysis"&&sel&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 330px",gap:18,animation:"fadeIn .3s ease"}}>
            <div>
              <div style={{...G.card,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                  <div style={{width:54,height:54,borderRadius:12,background:SEC_BG[sel.sector],border:`2px solid ${SEC_COLOR[sel.sector]}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:SEC_COLOR[sel.sector],flexShrink:0}}>{sel.abbr}</div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                      <span style={{fontSize:22,fontWeight:800}}>{sel.name}</span>
                      <span style={{fontSize:13,color:SEC_COLOR[sel.sector],fontWeight:700}}>{sel.sym}</span>
                      <span style={{fontSize:20}}>{sel.country==="US"?"🇺🇸":"🇨🇦"}</span>
                      <span style={G.sig(selSig)}>{selSig.status}</span>
                      {selSc.approved&&<span style={{background:"#f0fdf4",color:T.green,border:"1px solid #86efac",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>✓ BARSI APPROVED</span>}
                    </div>
                    <div style={{fontSize:32,fontWeight:900,lineHeight:1}}>
                      {livePrice?fd(livePrice):<span style={{color:T.muted,fontSize:20}}>Loading…</span>}
                      {quoteLoading&&<span style={{marginLeft:8,fontSize:14,animation:"spin 1s linear infinite",display:"inline-block",color:T.amber}}>◈</span>}
                    </div>
                    {livePrice&&<div style={{color:getChg(sel)>=0?T.green:T.red,fontSize:13,fontWeight:600,marginTop:4}}>{fPct(getChg(sel))} today · {sel.freq} dividends</div>}
                    <div style={{fontSize:12,color:T.muted,marginTop:6,lineHeight:1.65,maxWidth:520}}>{sel.desc}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button style={G.btn()} onClick={()=>analyzeStock(sel)}>🤖 AI Analysis</button>
                  <button style={G.btn("#7c3aed")} onClick={()=>selectStock(sel,"technical")}>📈 Technical</button>
                  <button style={G.btn(T.gold)} onClick={()=>{setPForm({sym:sel.sym,qty:"",avg:livePrice?livePrice.toFixed(2):""});setTab("portfolio");}}>+ Portfolio</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(118px,1fr))",gap:10,marginBottom:14}}>
                {[
                  {l:"Live Yield",v:livePrice?`${getLiveDY(sel).toFixed(2)}%`:"–",c:getLiveDY(sel)>=4?T.green:getLiveDY(sel)>=3?T.amber:T.red},
                  {l:"Annual DPS",v:fd(sel.dpa),c:T.navy},
                  {l:"FCF Payout",v:`${sel.fcfPayout}%`,c:sel.fcfPayout<=70?T.green:sel.fcfPayout<=100?T.amber:T.red},
                  {l:"FCF Yield",v:`${sel.fcfYield}%`,c:sel.fcfYield>=6?T.green:T.amber},
                  {l:"ROE",v:`${sel.roe}%`,c:sel.roe>=20?T.green:sel.roe>=10?T.amber:T.red},
                  {l:"Moat",v:`${sel.moat}/10`,c:sel.moat>=8?T.green:T.amber},
                  {l:"Mgmt",v:`${sel.mgmt}/10`,c:sel.mgmt>=8?T.green:T.amber},
                  {l:"Intrinsic",v:`~${fd(sel.intrinsic)}`,c:ivGap>=10?T.green:T.amber},
                  {l:"P/E",v:`${sel.pe_static}x`,c:sel.pe_static<=16?T.green:sel.pe_static<=25?T.amber:T.red},
                  {l:"52W High",v:quotes[sel.yahooSym]?.week52h?fd(quotes[sel.yahooSym].week52h):"–",c:T.muted},
                  {l:"52W Low",v:quotes[sel.yahooSym]?.week52l?fd(quotes[sel.yahooSym].week52l):"–",c:T.muted},
                  {l:"Mkt Cap",v:quotes[sel.yahooSym]?.mktCap?fM(quotes[sel.yahooSym].mktCap):"–",c:T.muted},
                ].map(k=>(<div key={k.l} style={G.kpi}><div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5}}>{k.l}</div><div style={{fontSize:17,fontWeight:800,color:k.c}}>{k.v}</div></div>))}
              </div>
              <div style={G.card}>
                <div style={G.lbl}>Dividend Yield History — 5 Years</div>
                <DYBars values={sel.dy5y} color={T.navy}/>
                <div style={{display:"flex",gap:20,marginTop:12,fontSize:12,color:T.muted,flexWrap:"wrap"}}>
                  <span>Avg: <strong style={{color:T.navy}}>{(sel.dy5y.reduce((a,b)=>a+b,0)/5).toFixed(2)}%</strong></span>
                  <span>Low: <strong style={{color:T.red}}>{Math.min(...sel.dy5y).toFixed(2)}%</strong></span>
                  <span>High: <strong style={{color:T.green}}>{Math.max(...sel.dy5y).toFixed(2)}%</strong></span>
                  <span>Live DY: <strong style={{color:T.navy}}>{livePrice?`${getLiveDY(sel).toFixed(2)}%`:"–"}</strong></span>
                </div>
              </div>
              <div style={G.card}>
                <div style={G.lbl}>Management & Moat</div>
                <div style={{fontSize:12,color:T.muted,marginBottom:8}}><strong style={{color:T.text}}>Management ({sel.mgmt}/10):</strong> {sel.mgmtNote}</div>
                <div style={{fontSize:12,color:T.muted}}><strong style={{color:T.text}}>Moat ({sel.moat}/10):</strong> {sel.moatNote}</div>
              </div>
              {(aiLoad||aiText||aiErr)&&(
                <div style={{...G.card,border:`1px solid ${T.navy}25`,background:T.light}}>
                  <div style={{fontSize:11,color:T.navy,letterSpacing:1.2,fontWeight:700,marginBottom:12}}>🤖 AI ANALYSIS — {sel.sym}</div>
                  {aiLoad&&<div style={{color:T.muted,fontSize:13,display:"flex",alignItems:"center",gap:10,padding:"20px 0"}}><span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:18}}>◈</span>Analyzing Barsi criteria + technical picture…</div>}
                  {aiErr&&<div style={{color:T.red,fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{aiErr}</div>}
                  {aiText&&<div style={{fontSize:13,lineHeight:2,color:T.text,whiteSpace:"pre-wrap"}}>{aiText}</div>}
                </div>
              )}
            </div>
            <div>
              <div style={{...G.card,textAlign:"center"}}>
                <div style={G.lbl}>Barsi Score (21 Criteria)</div>
                <ScoreGauge pct={selSc.pct} grade={selSc.grade} color={selSc.color}/>
                <div style={{marginTop:10,padding:"8px",background:selSc.bg,border:`1px solid ${selSc.color}30`,borderRadius:8,fontSize:12,color:selSc.color,fontWeight:700}}>{selSc.verdict}</div>
                {selSc.approved?<div style={{marginTop:8,padding:"8px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,fontSize:12,color:T.green,fontWeight:700}}>✓ BARSI APPROVED</div>:<div style={{marginTop:8,padding:"8px",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,fontSize:12,color:T.red}}>✗ Doesn't meet core criteria</div>}
              </div>
              <div style={{...G.card,border:`2px solid ${selSig.border}`,background:selSig.bg}}>
                <div style={G.lbl}>Buy Signal</div>
                <div style={{fontSize:15,fontWeight:800,color:selSig.color,marginBottom:12}}>{selSig.status}</div>
                {[
                  {l:`Fair Value (${selSig.tgt.toFixed(1)}% target)`,v:fd(selSig.fair),c:T.navy,b:true},
                  {l:"Upside",v:livePrice?fPct(selSig.upside):"–",c:selSig.upside>=0?T.green:T.red,b:false},
                  {l:"Margin of Safety",v:livePrice?`${selSig.mos.toFixed(1)}%`:"–",c:selSig.mos>15?T.green:T.amber,b:false},
                ].map(r=>(<div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}><span style={{color:T.muted}}>{r.l}</span><span style={{color:r.c,fontWeight:r.b?800:700}}>{r.v}</span></div>))}
                <div style={{marginTop:14}}>
                  <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:8}}>ENTRY ZONES</div>
                  {[["🟢 Aggressive",selSig.zones.agg],["🔵 Standard (−10%)",selSig.zones.std],["🟣 Conservative (−20%)",selSig.zones.cons]].map((r:any)=>(
                    <div key={r[0]} style={{display:"flex",justifyContent:"space-between",padding:"6px 9px",borderRadius:6,background:"rgba(255,255,255,0.65)",marginBottom:4,fontSize:12}}>
                      <span>{r[0]}</span><span style={{fontWeight:700,color:T.navy}}>{fd(r[1])}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:12}}>
                  <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:8}}>YIELD PRICE TARGETS</div>
                  {[["3% yield",selSig.y3,T.amber],["4% yield",selSig.y4,T.green],["5% yield",selSig.y5,"#16a34a"]].map((r:any)=>(
                    <div key={r[0]} style={{display:"flex",justifyContent:"space-between",padding:"5px 9px",borderRadius:6,background:"rgba(255,255,255,0.65)",marginBottom:3,fontSize:12}}>
                      <span>{r[0]}</span><span style={{fontWeight:700,color:r[2]}}>{fd(r[1])}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:10,padding:"8px",background:"rgba(255,255,255,0.6)",borderRadius:7,fontSize:11,color:T.muted}}>Stop (thesis change): {fd(selSig.stop)}</div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TECHNICAL ANALYSIS ══ */}
        {tab==="technical"&&sel&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            {/* Stock header */}
            <div style={{...G.card,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"14px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:10,background:SEC_BG[sel.sector],color:SEC_COLOR[sel.sector],display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800}}>{sel.abbr}</div>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20,fontWeight:800}}>{sel.name}</span>
                    <span style={{fontSize:12,color:SEC_COLOR[sel.sector],fontWeight:700}}>{sel.sym}</span>
                    {techAnalysis&&<span style={{background:techAnalysis.bg,color:techAnalysis.color,border:`1px solid ${techAnalysis.color}40`,borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:800}}>{techAnalysis.label}</span>}
                  </div>
                  <div style={{fontSize:28,fontWeight:900}}>{livePrice?fd(livePrice):"–"} <span style={{fontSize:14,color:getChg(sel)>=0?T.green:T.red,fontWeight:600}}>{livePrice?fPct(getChg(sel)):"–"}</span></div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {/* Range selector */}
                <div style={{display:"flex",gap:4}}>
                  {["1mo","3mo","6mo","1y","2y"].map(r=><button key={r} onClick={()=>{setChartRange(r);}} style={{...G.ovlBtn(chartRange===r),fontSize:11,padding:"5px 10px"}}>{r}</button>)}
                </div>
                <button style={G.btn()} onClick={()=>analyzeStock(sel)}>🤖 AI Analysis</button>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:18}}>
              {/* Chart area */}
              <div>
                {/* Overlay toggles */}
                <div style={{...G.card,padding:"12px 16px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,color:T.muted,fontWeight:700,marginRight:4}}>OVERLAYS:</span>
                  {[["ema20","EMA 20","#f59e0b"],["ema50","EMA 50","#e879f9"],["ema200","EMA 200","#22c55e"],["bb","Bollinger","#818cf8"],["vwap","VWAP","#22d3ee"],["sar","SAR","#94a3b8"],["fib","Fibonacci","#fbbf24"]].map(([k,l,c])=>(
                    <button key={k} onClick={()=>toggleOvl(k)} style={{...G.ovlBtn(overlays.includes(k)),borderColor:overlays.includes(k)?(c as string):T.border,color:overlays.includes(k)?(c as string):T.muted,background:overlays.includes(k)?(c as string)+"18":"#fff"}}>{l}</button>
                  ))}
                </div>

                {/* Candlestick chart */}
                <div style={{...G.card,padding:"10px 14px"}}>
                  <div style={{display:"flex",gap:12,marginBottom:6,fontSize:10,flexWrap:"wrap",alignItems:"center"}}>
                    {overlays.includes("ema20")&&<span style={{color:"#f59e0b"}}>── EMA20</span>}
                    {overlays.includes("ema50")&&<span style={{color:"#e879f9"}}>── EMA50</span>}
                    {overlays.includes("ema200")&&<span style={{color:"#22c55e"}}>── EMA200</span>}
                    {overlays.includes("bb")&&<span style={{color:"#818cf8"}}>-- Bollinger</span>}
                    {overlays.includes("vwap")&&<span style={{color:"#22d3ee"}}>-- VWAP</span>}
                    {overlays.includes("fib")&&<span style={{color:"#fbbf24"}}>-- Fib</span>}
                    {overlays.includes("sar")&&<span style={{color:"#94a3b8"}}>● SAR</span>}
                    <span style={{marginLeft:"auto",fontSize:11,color:T.muted}}>{selBars.length} candles · {chartRange}</span>
                  </div>
                  {barsLoading?<div style={{height:280,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted}}><span style={{animation:"spin 1s linear infinite",display:"inline-block",marginRight:8,fontSize:18}}>◈</span>Loading chart from Yahoo Finance…</div>
                    :<CandleChart bars={selBars} overlays={overlays}/>}
                </div>

                {/* Volume */}
                <div style={{...G.card,padding:"8px 14px"}}>
                  <div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:4}}>VOLUME</div>
                  <VolumeChart bars={selBars}/>
                </div>

                {/* Oscillator */}
                <div style={{...G.card,padding:"10px 14px"}}>
                  <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
                    {[["macd","MACD(12,26,9)"],["rsi","RSI(14)"],["stoch","Stochastic(14)"],["adx","ADX(14)"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setOscType(k)} style={{...G.ovlBtn(oscType===k),fontSize:10}}>{l}</button>
                    ))}
                    <span style={{fontSize:10,color:T.muted,marginLeft:8}}>
                      {oscType==="macd"&&"── MACD  ── Signal  ▮ Hist"}
                      {oscType==="rsi"&&"Oversold<30  Overbought>70"}
                      {oscType==="stoch"&&"── %K  ── %D  | 20/80 levels"}
                      {oscType==="adx"&&"── ADX  ── +DI  ── -DI  | 25=trend"}
                    </span>
                  </div>
                  {selBars.length>0&&<OscChart bars={selBars} type={oscType}/>}
                </div>

                {/* AI result */}
                {(aiLoad||aiText||aiErr)&&(
                  <div style={{...G.card,border:`1px solid ${T.navy}25`,background:T.light}}>
                    <div style={{fontSize:11,color:T.navy,letterSpacing:1.2,fontWeight:700,marginBottom:12}}>🤖 AI COMBINED ANALYSIS — {sel.sym}</div>
                    {aiLoad&&<div style={{color:T.muted,fontSize:13,display:"flex",alignItems:"center",gap:10,padding:"20px 0"}}><span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:18}}>◈</span>Analyzing Barsi criteria + full technical picture…</div>}
                    {aiErr&&<div style={{color:T.red,fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{aiErr}</div>}
                    {aiText&&<div style={{fontSize:13,lineHeight:2,color:T.text,whiteSpace:"pre-wrap"}}>{aiText}</div>}
                  </div>
                )}
              </div>

              {/* Right: signals panel */}
              <div>
                {techAnalysis?(
                  <>
                    {/* Composite score */}
                    <div style={{...G.card,textAlign:"center",border:`1px solid ${techAnalysis.color}30`}}>
                      <div style={G.lbl}>Technical Score</div>
                      <div style={{fontSize:52,fontWeight:900,color:techAnalysis.color,lineHeight:1}}>{techAnalysis.score}</div>
                      <div style={{marginTop:8,display:"inline-block",background:techAnalysis.bg,color:techAnalysis.color,border:`1px solid ${techAnalysis.color}50`,borderRadius:6,padding:"5px 14px",fontSize:12,fontWeight:800}}>{techAnalysis.label}</div>
                      {/* Bull/bear bar */}
                      <div style={{marginTop:14}}>
                        {(()=>{const tw=techAnalysis.votes.reduce((a,v)=>a+v.weight,0);const bw2=techAnalysis.votes.filter(v=>v.signal==="BULL").reduce((a,v)=>a+v.weight,0);const nw=techAnalysis.votes.filter(v=>v.signal==="NEUTRAL").reduce((a,v)=>a+v.weight,0);return<>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:5}}>
                            <span style={{color:T.green}}>Bull {Math.round(bw2/tw*100)}%</span>
                            <span style={{color:T.muted}}>Neutral {Math.round(nw/tw*100)}%</span>
                            <span style={{color:T.red}}>Bear {Math.round((tw-bw2-nw)/tw*100)}%</span>
                          </div>
                          <div style={{height:8,background:T.border,borderRadius:4,overflow:"hidden",display:"flex"}}>
                            <div style={{width:`${bw2/tw*100}%`,background:`linear-gradient(90deg,${T.green},#22c55e)`}}/>
                            <div style={{width:`${nw/tw*100}%`,background:T.border}}/>
                            <div style={{flex:1,background:`linear-gradient(90deg,#ef4444,${T.red})`}}/>
                          </div>
                        </>;})()} 
                      </div>
                    </div>

                    {/* Trade setup */}
                    <div style={{...G.card,background:techAnalysis.setup.side==="LONG"?"#f0fdf4":techAnalysis.setup.side==="SHORT"?"#fef2f2":"#fffbeb",border:`1px solid ${techAnalysis.setup.side==="LONG"?"#86efac":techAnalysis.setup.side==="SHORT"?"#fca5a5":"#fbbf24"}`}}>
                      <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:10,letterSpacing:1}}>
                        {techAnalysis.setup.side==="WAIT"?"⏸ WAIT — NO CLEAR EDGE":`ATR TRADE SETUP (${techAnalysis.setup.side})`}
                      </div>
                      {techAnalysis.setup.side!=="WAIT"&&[
                        {l:"Entry",v:fd(techAnalysis.setup.entry),c:T.text},
                        {l:"Stop Loss",v:fd(techAnalysis.setup.stop),c:T.red},
                        {l:"Take Profit",v:fd(techAnalysis.setup.target),c:T.green},
                        {l:"Risk:Reward",v:`1 : ${techAnalysis.setup.rr}`,c:parseFloat(techAnalysis.setup.rr)>=2?T.green:T.amber},
                      ].map(r=>(<div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid rgba(0,0,0,0.05)`,fontSize:12}}><span style={{color:T.muted}}>{r.l}</span><span style={{color:r.c,fontWeight:700}}>{r.v}</span></div>))}
                      {techAnalysis.setup.side==="WAIT"&&<div style={{fontSize:11,color:T.amber}}>Indicators are mixed. Wait for clearer confluence before entering any position.</div>}
                      <div style={{marginTop:8,fontSize:10,color:T.muted}}>⚠ ATR-based setup. Always size to your own risk tolerance.</div>
                    </div>

                    {/* Indicator votes */}
                    <div style={G.card}>
                      <div style={G.lbl}>Indicator Votes</div>
                      {techAnalysis.votes.map(v=>(
                        <div key={v.name} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 0",borderBottom:`1px solid ${T.light}`}}>
                          <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,marginTop:2,background:v.signal==="BULL"?T.green:v.signal==="BEAR"?T.red:T.border}}/>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span style={{fontSize:11,fontWeight:700}}>{v.name}</span>
                              <span style={{fontSize:9,color:v.signal==="BULL"?T.green:v.signal==="BEAR"?T.red:T.muted,fontWeight:800}}>{v.signal}</span>
                            </div>
                            <div style={{fontSize:10,color:T.muted,marginTop:2,lineHeight:1.4}}>{v.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Fibonacci levels */}
                    {selBars.length>0&&(()=>{
                      const f=fib(selBars);
                      return<div style={G.card}>
                        <div style={G.lbl}>Fibonacci Levels</div>
                        {[{l:"Swing High",v:f.hi,c:T.green},{l:"23.6%",v:f.r236,c:"#f59e0b"},{l:"38.2%",v:f.r382,c:"#ef4444"},{l:"50.0%",v:f.r500,c:"#8b5cf6"},{l:"61.8% (Golden)",v:f.r618,c:"#e879f9"},{l:"78.6%",v:f.r786,c:"#64748b"},{l:"Swing Low",v:f.lo,c:T.red}].map(r=>(
                          <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.light}`,fontSize:12}}>
                            <span style={{color:r.c,fontWeight:600}}>{r.l}</span>
                            <span style={{fontWeight:700}}>{fd(r.v)}</span>
                          </div>
                        ))}
                      </div>;
                    })()}
                  </>
                ):(
                  <div style={{...G.card,textAlign:"center",padding:40}}>
                    <div style={{fontSize:14,color:T.muted,marginBottom:12}}>
                      {barsLoading?"⏳ Loading chart data…":"📈 Chart data will load automatically"}
                    </div>
                    {barsLoading&&<span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:24,color:T.amber}}>◈</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ PORTFOLIO ══ */}
        {tab==="portfolio"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            {!user&&<div style={{...G.card,background:"#fffbeb",border:`1px solid ${T.gold}`,textAlign:"center",padding:14,marginBottom:14}}>
              <span style={{fontSize:13,color:T.amber}}>💡 <strong>Sign in</strong> to save your portfolio to the cloud.</span>
              <button onClick={()=>setShowAuth(true)} style={{...G.btn(T.navy),marginLeft:10,padding:"6px 14px",fontSize:12}}>Create Free Account</button>
            </div>}
            <div style={{background:`linear-gradient(135deg,${T.navyD},${T.navy})`,borderRadius:12,padding:"20px 24px",marginBottom:14,color:"#fff"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",letterSpacing:1.5,marginBottom:6}}>YOUR MONTHLY DIVIDEND INCOME</div>
              <div style={{fontSize:40,fontWeight:900}}>{fM(portTot.monthly)}/month</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginTop:4}}>{fM(portTot.div)}/year · {portTot.avgDY.toFixed(2)}% portfolio yield · Prices live from Yahoo Finance</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12,marginBottom:16}}>
              {[{l:"Portfolio Value",v:fM(portTot.val),c:T.text},{l:"Total Cost",v:fM(portTot.cost),c:T.muted},{l:"Gain/Loss",v:fM(portTot.gain),c:portTot.gain>=0?T.green:T.red},{l:"Total Return",v:fPct(portTot.gainPct),c:portTot.gainPct>=0?T.green:T.red},{l:"Annual Income",v:fM(portTot.div),c:T.amber},{l:"Monthly Income",v:fM(portTot.monthly),c:T.green},{l:"Portfolio Yield",v:`${portTot.avgDY.toFixed(2)}%`,c:portTot.avgDY>=4?T.green:T.amber}].map(k=>(<div key={k.l} style={G.kpi}><div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5}}>{k.l}</div><div style={{fontSize:20,fontWeight:800,color:k.c}}>{k.v}</div></div>))}
            </div>
            <div style={{...G.card,overflowX:"auto"}}>
              <div style={G.lbl}>Holdings (Live Prices)</div>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
                <thead><tr>{["STOCK","SHARES","AVG COST","LIVE PRICE","VALUE","GAIN","LIVE DY","ANNUAL INC.","SIGNAL","GRADE",""].map(h=><th key={h} style={G.TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {portRows.map((r:any)=>(
                    <tr key={r.sym} style={{cursor:"pointer"}} onClick={()=>selectStock(r.s,"analysis")}>
                      <td style={G.TD}><div style={{fontWeight:700}}>{r.sym}</div><div style={{fontSize:11,color:T.muted}}>{r.s.name}</div></td>
                      <td style={{...G.TD,color:T.muted}}>{r.qty}</td>
                      <td style={{...G.TD,color:T.muted}}>{fd(r.avg)}</td>
                      <td style={{...G.TD,fontWeight:800}}>{fd(r.price)}</td>
                      <td style={{...G.TD,fontWeight:700}}>{fM(r.val)}</td>
                      <td style={{...G.TD,color:r.gain>=0?T.green:T.red,fontWeight:700}}>{r.gain>=0?"+":"-"}${Math.abs(r.gain).toFixed(0)} ({fPct(r.gainPct)})</td>
                      <td style={{...G.TD,color:T.amber,fontWeight:700}}>{getLiveDY(r.s).toFixed(2)}%</td>
                      <td style={{...G.TD,color:T.green,fontWeight:700}}>{fM(r.annDiv)}/yr</td>
                      <td style={G.TD}><span style={G.sig(r.sig)}>{r.sig.status}</span></td>
                      <td style={G.TD}><span style={{color:r.sc?.color,fontWeight:800,fontSize:15}}>{r.sc?.grade}</span></td>
                      <td style={G.TD}><button onClick={(e)=>{e.stopPropagation();setPort((p:any)=>p.filter((x:any)=>x.sym!==r.sym));}} style={{background:"#fef2f2",border:"1px solid #fca5a5",color:T.red,borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
                {(["sym","qty","avg"] as const).map(k=>(
                  <input key={k} style={{...G.inp,flex:1,minWidth:100}} placeholder={{sym:"Symbol (JNJ)",qty:"Shares",avg:"Avg cost $"}[k]} value={(pForm as any)[k]} onChange={e=>setPForm((f:any)=>({...f,[k]:k==="sym"?e.target.value.toUpperCase():e.target.value}))}/>
                ))}
                <button onClick={()=>{
                  const s=STOCKS_BASE.find(x=>x.sym===pForm.sym);
                  if(!s){alert("Symbol not found. Use symbols from the SGC Invest universe.");return;}
                  if(!pForm.qty||!pForm.avg)return;
                  setPort((p:any)=>[...p.filter((x:any)=>x.sym!==pForm.sym),{sym:pForm.sym,qty:+pForm.qty,avg:+pForm.avg}]);
                  setPForm({sym:"",qty:"",avg:""});
                }} style={G.btn()}>+ Add Position</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ WEALTH ENGINE ══ */}
        {tab==="projector"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <div style={{background:`linear-gradient(135deg,${T.navyD},${T.navy})`,borderRadius:12,padding:"24px 28px",marginBottom:16,color:"#fff"}}>
              <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>💎 Barsi Wealth Engine</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:20}}>Reinvest every dividend, never sell, let compounding do the rest</div>
              {projFinal&&(()=>{
                const m1k=projData.find(d=>d.monthly>=1000);const m5k=projData.find(d=>d.monthly>=5000);const m10k=projData.find(d=>d.monthly>=10000);
                return<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[m1k?{icon:"🏆",t:"$1,000/month",y:`Year ${m1k.year}`}:null,m5k?{icon:"🚀",t:"$5,000/month — freedom",y:`Year ${m5k.year}`}:null,m10k?{icon:"💎",t:"$10,000/month",y:`Year ${m10k.year}`}:null,{icon:"📅",t:`Portfolio: ${fM(projFinal.portfolio)}`,y:`Year ${pYrs}`}].filter(Boolean).map((m:any,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px"}}>
                      <span style={{fontSize:20}}>{m.icon}</span>
                      <div><div style={{fontSize:12}}>{m.t}</div><div style={{fontSize:12,color:"#e8c66e",fontWeight:700}}>{m.y}</div></div>
                    </div>
                  ))}
                </div>;
              })()}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:18}}>
              <div style={G.card}>
                <div style={G.lbl}>Parameters</div>
                {[{l:`Starting Capital: ${fM(pCap)}`,min:0,max:500000,step:5000,v:pCap,set:setPCap},{l:`Monthly Contribution: ${fM(pMon)}`,min:0,max:10000,step:100,v:pMon,set:setPMon},{l:`Portfolio Yield: ${pDY.toFixed(2)}%`,min:2,max:12,step:0.25,v:pDY,set:setPDY},{l:`Annual Price Growth: ${pGrw.toFixed(1)}%`,min:0,max:10,step:0.5,v:pGrw,set:setPGrw},{l:`Horizon: ${pYrs} years`,min:5,max:40,step:1,v:pYrs,set:setPYrs}].map(f=>(
                  <div key={f.l} style={{marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:5}}>{f.l}</div>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={f.v} onChange={e=>f.set(+e.target.value)} style={{width:"100%",accentColor:T.navy}}/>
                  </div>
                ))}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
                  {[{l:"Starter",c:10000,m:500,d:3.5,y:25},{l:"Builder",c:50000,m:1000,d:4,y:25},{l:"Accelerator",c:100000,m:2000,d:4.5,y:20},{l:"Barsi Mode",c:250000,m:5000,d:5,y:15}].map(p=>(
                    <button key={p.l} onClick={()=>{setPCap(p.c);setPMon(p.m);setPDY(p.d);setPYrs(p.y);}} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"#fff",color:T.navy,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{p.l}</button>
                  ))}
                </div>
              </div>
              <div>
                {projFinal&&<>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:14}}>
                    {[{l:`Portfolio in ${pYrs}yr`,v:fM(projFinal.portfolio),c:T.navy},{l:"Total Invested",v:fM(projFinal.invested),c:T.muted},{l:"Net Gain",v:fM(projFinal.portfolio-projFinal.invested),c:T.green},{l:"Multiplier",v:`${(projFinal.portfolio/projFinal.invested).toFixed(1)}x`,c:"#7c3aed"},{l:"Annual Income",v:fM(projFinal.annDiv),c:T.amber},{l:"Monthly Income",v:fM(projFinal.monthly),c:T.green}].map(k=>(<div key={k.l} style={G.kpi}><div style={{fontSize:10,color:T.muted,fontWeight:600,marginBottom:5}}>{k.l}</div><div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div></div>))}
                  </div>
                  <div style={{...G.card,padding:"12px 16px",marginBottom:14}}>
                    <div style={{display:"flex",gap:16,marginBottom:8,fontSize:11,color:T.muted}}>
                      <span style={{color:T.navy,fontWeight:600}}>── Portfolio</span><span>-- Invested</span><span style={{color:T.gold,fontWeight:600}}>── Annual Income</span>
                    </div>
                    <ProjChart data={projData}/>
                  </div>
                  <div style={{...G.card,overflowX:"auto"}}>
                    <div style={G.lbl}>Year-by-Year</div>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr>{["Year","Invested","Portfolio","×","Annual Income","Monthly Income"].map(h=><th key={h} style={G.TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {projData.filter((_,i)=>i%Math.max(1,Math.floor(pYrs/10))===0||i===projData.length-1).map(r=>(
                          <tr key={r.year}>
                            <td style={{...G.TD,fontWeight:700,color:T.navy}}>{r.year}</td>
                            <td style={{...G.TD,color:T.muted}}>{fM(r.invested)}</td>
                            <td style={{...G.TD,fontWeight:700}}>{fM(r.portfolio)}</td>
                            <td style={{...G.TD,color:"#7c3aed",fontWeight:700}}>{(r.portfolio/r.invested).toFixed(1)}x</td>
                            <td style={{...G.TD,color:T.amber}}>{fM(r.annDiv)}</td>
                            <td style={{...G.TD,color:T.green,fontWeight:700}}>{fM(r.monthly)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAX ══ */}
        {tab==="tax"&&<div style={{animation:"fadeIn .3s ease"}}><TaxCalc/></div>}

        {/* ══ EDUCATION ══ */}
        {tab==="education"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,animation:"fadeIn .3s ease"}}>
            <div style={G.card}>
              <div style={G.lbl}>💎 Luiz Barsi Filho</div>
              <div style={{fontSize:13,lineHeight:2}}>
                <p><strong style={{color:T.navy}}>Born 1939, São Paulo.</strong> Started as a shoeshine boy at age 9. Today — Brazil's largest individual investor.</p>
                <p>Estimated fortune: <strong style={{color:T.navy}}>~R$4 billion (~$800M USD)</strong>. Receives <strong>R$170M+/year</strong> in dividends without ever selling a core position.</p>
                <p style={{fontStyle:"italic",color:T.gold}}>"The stock market is for building income, not for speculation."</p>
              </div>
            </div>
            <div style={G.card}>
              <div style={G.lbl}>📐 Fair Value Formula</div>
              <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:16,textAlign:"center",marginBottom:14}}>
                <div style={{fontSize:12,color:T.muted,marginBottom:6}}>FAIR VALUE = Annual DPS ÷ Target Yield %</div>
                <div style={{fontSize:18,fontWeight:800,color:T.navy}}>P_fair = DPS ÷ Min. Yield</div>
              </div>
              <div style={{fontSize:11,color:T.muted,fontWeight:700,marginBottom:8,letterSpacing:1}}>SECTOR TARGET YIELDS</div>
              {Object.entries(TARGET_YIELD).map(([sec,tgt])=>(
                <div key={sec} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                  <span style={{color:SEC_COLOR[sec]||T.muted,fontWeight:600}}>{sec}</span>
                  <span style={{fontWeight:700}}>{(tgt*100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div style={G.card}>
              <div style={G.lbl}>📜 Barsi's 10 Principles</div>
              {[["Buy & Hold permanently","Never sell core positions. Own businesses, not bets."],["Yield must meet threshold","Only buy if yield meets sector target."],["Essential sectors only","Banks, energy, utilities, telecom, pipelines, healthcare."],["10+ years of dividend history","Need a proven track record, not one good year."],["Buy below fair value","Cheaper price = higher yield = larger safety margin."],["Reinvest 100% of dividends","The snowball only compounds if you reinvest everything."],["Avoid over-leveraged companies","Excessive debt kills dividends first in downturns."],["Management integrity","If they don't respect minority shareholders, leave."],["Think in decades","'The biggest mistake is wanting results too fast.'"],["Build your private pension","Income covering your cost of living, forever."]].map((p,i)=>(
                <div key={i} style={{display:"flex",gap:10,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.navy,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>{i+1}</div>
                  <div><div style={{fontSize:12,fontWeight:700,marginBottom:2}}>{p[0]}</div><div style={{fontSize:11,color:T.muted,lineHeight:1.5}}>{p[1]}</div></div>
                </div>
              ))}
            </div>
            <div style={G.card}>
              <div style={G.lbl}>📊 All 21 Barsi Criteria</div>
              {[{cat:"💰 Dividend (1–6)",items:["1. Dividend Yield","2. Consecutive Increases","3. DPS Growth Trend","4. GAAP Payout","5. FCF Payout ★ Most Important","6. FCF Yield"]},{cat:"📈 Quality (7–12)",items:["7. Profit Streak","8. EPS Growth 5yr","9. ROE","10. EBITDA Margin","11. Revenue Recurring","12. Revenue Growth"]},{cat:"🎯 Management & Moat (13–15)",items:["13. Management Quality","14. Competitive Moat","15. Market Liquidity"]},{cat:"💵 Valuation & Risk (16–21)",items:["16. P/E Ratio","17. Price/Book","18. Margin of Safety","19. Debt/Equity","20. Net Debt/EBITDA","21. Rate Sensitivity"]}].map(({cat,items})=>(
                <div key={cat} style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:T.navy,fontWeight:700,marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${T.border}`}}>{cat}</div>
                  {items.map(item=><div key={item} style={{fontSize:11,color:T.muted,padding:"2px 0"}}>• {item}</div>)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ AI ADVISOR ══ */}
        {tab==="ai"&&(
          <div style={{maxWidth:820,margin:"0 auto",animation:"fadeIn .3s ease"}}>
            <div style={{...G.card,border:`1px solid ${T.navy}25`}}>
              <div style={{fontSize:16,fontWeight:800,color:T.navy,marginBottom:4}}>🤖 AI Advisor — Barsi + Technical Analysis</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:16}}>Ask about any stock, Barsi criteria, technical signals, FCF analysis, or portfolio construction. I have live prices and chart data for all 24 stocks.</div>
              {chat.length===0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                  {["Which stock has the strongest combined signal (Barsi + technical)?","Compare JNJ vs MDT — fundamental and technical view","ENB vs TRP — which pipeline for income right now?","Explain RSI divergence and how it applies to dividend stocks","How do I use Bollinger Band squeeze for entry timing?","Best stocks where fair value AND RSI both signal buy?","How to build a $5,000/month dividend portfolio?","What does FCF payout tell us that GAAP payout doesn't?"].map(q=>(
                    <button key={q} onClick={()=>setChatIn(q)} style={{background:T.light,border:`1px solid ${T.border}`,color:T.muted,padding:"7px 12px",borderRadius:8,fontSize:11,cursor:"pointer",fontFamily:"inherit",textAlign:"left",fontWeight:500}}>{q}</button>
                  ))}
                </div>
              )}
              <div style={{height:450,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingRight:4,marginBottom:14}}>
                {chat.map((m,i)=>(
                  <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"82%"}}>
                    <div style={{padding:"12px 16px",borderRadius:m.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px",background:m.role==="user"?T.navy:"#fff",border:m.role==="assistant"?`1px solid ${T.border}`:"none",boxShadow:m.role==="assistant"?T.shadow:"none",fontSize:13,lineHeight:1.85,color:m.role==="user"?"#fff":T.text,whiteSpace:"pre-wrap"}}>{m.content}</div>
                  </div>
                ))}
                {chatLoad&&<div style={{alignSelf:"flex-start"}}><div style={{padding:"12px 16px",borderRadius:"12px 12px 12px 3px",background:"#fff",border:`1px solid ${T.border}`,boxShadow:T.shadow,fontSize:13,color:T.muted,display:"flex",alignItems:"center",gap:8}}><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>◈</span>Analyzing…</div></div>}
                <div ref={chatEnd}/>
              </div>
              <div style={{display:"flex",gap:10}}>
                <input style={{flex:1,...G.inp}} placeholder="Ask about any stock, Barsi criteria, technical signals, dividend strategy…" value={chatIn} onChange={e=>setChatIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}/>
                <button style={{...G.btn(),padding:"12px 20px",fontSize:13}} onClick={sendChat} disabled={chatLoad}>▶</button>
              </div>
              <div style={{marginTop:8,fontSize:11,color:T.muted}}>⚠ Educational only · Not investment advice · DYOR · Investing involves risk of loss</div>
            </div>
          </div>
        )}

      </div>

      {/* FOOTER */}
      <div style={{background:T.navyD,color:"rgba(255,255,255,0.45)",padding:"18px 28px",marginTop:48,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,flexWrap:"wrap",gap:8}}>
        <div><strong style={{color:"#fff"}}>SGC Invest v4.0</strong> · Live prices · Barsi 21 Criteria · Technical Analysis · Built by SGC General Contractors · <a href="https://sgcbuilt.com" style={{color:"#e8c66e",textDecoration:"none"}}>sgcbuilt.com</a> · (703) 944-9770</div>
        <div>⚠ Educational tool · Not investment advice · Investing involves risk of loss · DYOR</div>
      </div>

      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)}/>}
    </div>
  );
}

export default function App() {
  return <AuthProvider><SGCApp/></AuthProvider>;
}
