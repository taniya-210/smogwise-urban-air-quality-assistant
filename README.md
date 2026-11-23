# SmogWise – Urban Air Quality Assistant

SmogWise is a full-stack, GenAI-powered web application that helps families, commuters, and local communities navigate severe winter smog and urban air pollution. It combines live air quality telemetry, transparent emission modeling, and Google Gemini AI recommendations inside a clean environmental-tech dashboard.

## Core Capabilities

1. **Personalized Air Quality Dashboard**
   - Search any global city via Open-Meteo Geocoding or select quick presets.
   - Fetches live air quality data via **Open-Meteo Air Quality (CAMS Assimilated Model)** and optionally nearest **WAQI ground monitoring stations** when `WAQI_API_TOKEN` is configured.
   - Always displays exact data source, observation timestamp, and whether data is live, assimilated/estimated, unavailable, or from clearly labeled **Demo Mode**. Never fabricates live readings.
   - Interactive 24-hour trend chart (US AQI, PM2.5, NO₂), diurnal safer-window detector, and WHO-referenced pollutant breakdown.

2. **AI Daily Routine Planner**
   - Uses Google Gemini (`gemini-4-hydrogen`) on the backend to generate time-blocked daily schedules, safer outdoor windows, and lower-emission commute alternatives tailored to your active AQI data and household profile.

3. **Indoor Air Quality Assistant**
   - Adapts ventilation timing, cooking emission control, damp cleaning practices, and mechanical filtration advice to current outdoor AQI and your home setup, including evidence-based checks against unsupported purification claims.

4. **Family Health Advisory**
   - Calibrated to US EPA AQI categories with tailored precautions for **Children**, **Adults**, **Older Adults**, and **People with Respiratory Sensitivities**, plus high-visibility warnings when AQI reaches Very Unhealthy (201–300) or Hazardous (301+). Strictly non-diagnostic with clear medical disclaimers.

5. **Sustainable Choices & Impact**
   - Interactive commute CO₂e calculator powered by cited **UK DESNZ / DEFRA 2024** emission factors, displaying the exact mathematical formula, assumptions, and annual comparison chart.

6. **Community Action Hub**
   - Generates copy-ready smog-day protocols, outreach campaigns, and ongoing pollution reduction programs for **Schools**, **Housing Societies**, **Offices**, and **Neighborhood Groups**.

7. **Gemini AI Assistant**
   - Conversational interface grounded in active location air quality and household context, separating **Verified Data Context** from **General Guidance**, with transparent rule-based **Fallback Mode** if the Gemini API is unavailable.

## Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide icons (`src/`)
- **Backend**: Node.js, Express, Zod request/response validation, `@google/genai` SDK (`server/`, `server.ts`)
- **Shared Domain Logic**: EPA AQI breakpoints, safer-window detection, family health guidance, transparent CO₂e math, and labeled demo scenarios (`src/shared/`)
- **Tests**: Vitest & Supertest covering calculations and Express API endpoints (`tests/`)

## Environment Variables

Configure environment variables on the server (see `.env.example`). API keys are strictly server-side and never exposed to the browser.

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Recommended | Google Gemini API key for AI routines, indoor guidance, community plans, and chat. When omitted or unreachable, endpoints automatically return clearly labeled Fallback Mode guidance. |
| `WAQI_API_TOKEN` | Optional | World Air Quality Index (aqicn.org) token for direct ground monitoring station AQI readings alongside Open-Meteo hourly curves. |
| `PORT` | Optional | Server listen port (defaults to `3000`). |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your GEMINI_API_KEY (and optional WAQI_API_TOKEN)

# 3. Start development server (Express API + Vite frontend on port 3000)
npm run dev
```

## Verification Commands

```bash
# Run unit & API integration tests
npm test

# Run TypeScript type & lint check
npm run lint

# Build production bundle
npm run build

# Start production server
NODE_ENV=production npm start
```

## Data Honesty & Safety Principles

- Live readings are never invented or patched with random numbers. If upstream APIs fail or omit a pollutant, SmogWise displays an explicit **Unavailable** state.
- Sample datasets are exclusively accessible as clearly labeled **Demo Mode (Illustrative — Not Live Data)** scenarios.
- Health advisories provide general EPA-aligned precautions and never diagnose medical conditions or replace licensed clinical care.
