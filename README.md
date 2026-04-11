# IMC Prosperity 4 — Pro Visualizer

High-performance dual-strategy trading log visualizer.

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

**Requires:** Node.js 18+

## What to Upload

Download your log file from the IMC Prosperity results page after running your algorithm.
It should contain the sections `Sandbox logs:`, `Activities log:`, and `Trade History:`.

- **Strategy A slot:** Your primary strategy log
- **Strategy B slot:** A second strategy to compare against (optional)

## Features

| Tab | What you see |
|---|---|
| Overview | Price chart + PnL + inventory heatmap |
| Microstructure | Order book depth snapshot + OFI/MLOFI |
| Advanced | ETF spread + VPIN flow toxicity + IV smile (options) |
| Delta | Side-by-side metrics comparison with statistical delta |
| Trades | Filtered trade table for current viewport |
| AI Analysis | Natural language queries about your logs (needs API key) |

## Controls

| Action | How |
|---|---|
| Zoom | Mouse wheel on any chart |
| Pan | Click and drag |
| Reset | Double-click any chart, or the ↔ button |
| Inspect | Hover — crosshair syncs across all charts |
| Product | Dropdown in the top bar |

## AI Analysis (optional)

Copy `.env.local.example` to `.env.local` and add your Anthropic or OpenAI key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The AI has full context of your log metrics and can answer questions like:
- "Why did PnL drop at timestamp 45000?"
- "Compare strategy A and B — which is better and why?"
- "Is my bot behaving like a market maker or a taker?"

## Log Format

The parser handles the standard IMC Prosperity format automatically:

```
Sandbox logs:
[timestamp] [product]: [your print() output]

Activities log:
day;timestamp;product;bid_price_1;bid_volume_1;...;mid_price;profit_and_loss

Trade History:
[{"timestamp":..., "buyer":"SUBMISSION", "seller":"BOT", "symbol":"...", "price":..., "quantity":...}]
```
