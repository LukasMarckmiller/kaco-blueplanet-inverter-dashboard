# KACO Blueplanet Inverter Dashboard

This project is a Vue 3 dashboard for monitoring a KACO Blueplanet inverter from a local endpoint. It polls inverter telemetry, shows the current operating state, and visualizes recent values over time so the system can be checked quickly from a browser.

## What the app does

- Displays live inverter metrics such as current AC power, temperature, frequency, total and daily energy, operating hours, warnings, and errors.
- Shows phase voltages and currents plus PV input voltages and currents in a compact overview.
- Polls a local inverter endpoint every 10 seconds.
- Stores recent samples in IndexedDB and renders a small trend chart for the selected metric.
- Falls back to built-in sample data when the device cannot be reached or when discovery fails.

## Inverter data from the endpoint

The dashboard expects a payload from the local endpoint at `/api/inverter` with this shape:

```json
{
  "data": {
    "flg": 1,
    "tim": "20260712193846",
    "tmp": 430,
    "fac": 4999,
    "pac": 0,
    "sac": 0,
    "qac": 0,
    "eto": 176403,
    "etd": 200,
    "hto": 11819,
    "pf": 0,
    "wan": 0,
    "err": 0,
    "vac": [2380, 2362, 2364],
    "iac": [5, 5, 5],
    "vpv": [1503, 1497],
    "ipv": [0, 0],
    "str": []
  },
  "source": "live",
  "host": "192.168.0.42",
  "status": "online"
}
```

The app interprets the values as follows:

- `tim` is parsed as a timestamp in `YYYYMMDDHHMMSS` format and formatted for display.
- `tmp` is divided by 10 to show temperature in °C.
- `fac` is divided by 100 to show frequency in Hz.
- `vac` and `iac` are converted to phase voltage/current values.
- `vpv` and `ipv` are converted to PV input voltage/current values.
- `pac`, `sac`, and `qac` are treated as raw power values and displayed in watts, VA, and var.

## Device discovery and fallback handling

Before showing live data, the app enters a discovery state and tries to reach the inverter endpoint. The UI reports whether the device is currently discovering, online, offline, or running on fallback sample data.

If the endpoint responds with a fallback payload, the dashboard:

- switches to a warning or fallback state,
- shows the reason for the fallback in the status banner, and
- continues rendering the interface with built-in demo values so the layout still works.

## History and charting

Each successful poll creates a history point and stores it in IndexedDB. The app keeps the last 60 samples and renders a compact line chart for the currently selected metric, such as power, temperature, frequency, energy, or PV values. This gives a quick view of how the inverter has behaved over time.

## Development

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```
