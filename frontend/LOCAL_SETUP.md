# Frontend Local Setup

This document explains what is required to run the frontend locally on a client machine.

## Required Tools

- Node.js (recommended: v20 or newer)
- npm (comes with Node.js)

## Install Dependencies

Open terminal inside `frontend` folder and run:

```bash
npm install
```

This installs all required frontend libraries from `package.json`, including:

- `react`
- `react-dom`
- `axios`
- `lightweight-charts`
- `vite`
- `eslint` and related plugins (dev tools)

## Run in Development

```bash
npm run dev
```

Then open the URL shown in terminal (usually `http://localhost:5173`).

## Build for Production

```bash
npm run build
```

Build output is generated in:

- `frontend/dist`

## Preview Production Build (optional)

```bash
npm run preview
```

## Important Note

Frontend calls backend APIs at `http://localhost:8000`.
So backend must also be running for full functionality (signals, backtesting, saved scenarios).
