# Home Assistant Plugin for Elgato Stream Deck

A full-featured Elgato Stream Deck plugin for controlling and monitoring your [Home Assistant](https://www.home-assistant.io/) smart home, built with the official [Elgato Stream Deck SDK v3](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started).

---

## Features

| Action | Description |
|---|---|
| **Toggle Entity** | Toggle any HA entity (lights, switches, fans, covers…) on/off. The button reflects the live state. |
| **Call Service** | Call any HA service with optional JSON data payload. |
| **Monitor State** | Display the live state of any entity directly on a key (sensors, thermostats, etc.). Configurable refresh interval. |
| **Activate Scene** | Activate any HA scene with a single button press. |

All actions share global connection settings (HA URL + long-lived access token) so you only need to configure them once.

---

## Requirements

- [Elgato Stream Deck software](https://www.elgato.com/downloads) 7.0 or later
- [Node.js](https://nodejs.org/) 20 or later (for building from source)
- A running [Home Assistant](https://www.home-assistant.io/) instance (local or remote)
- A [long-lived access token](https://www.home-assistant.io/docs/authentication/) from your HA profile

---

## Installation

### From source

```sh
# Install dependencies
npm install

# Build the plugin bundle
npm run build
```

The compiled plugin lives at `com.gameaday.homeassistant.sdPlugin/`. Install it by double-clicking the `.sdPlugin` folder (macOS/Windows) or by placing it in the Stream Deck plugins directory.

**macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`  
**Windows:** `%appdata%\Elgato\StreamDeck\Plugins\`

---

## Configuration

### Global settings (one-time setup)

Right-click the plugin icon in the Stream Deck app → **Plugin Preferences** (or the first time you drag an action to the deck):

| Field | Description |
|---|---|
| **Instance URL** | Full URL of your HA instance, e.g. `http://homeassistant.local:8123` |
| **Access Token** | Long-lived token from **Profile → Security** in HA |

Click **Test Connection** to verify connectivity.

### Action settings

Each action has its own property inspector with contextual options. Drag an action to a key and click it to open settings in the Stream Deck software.

---

## Project structure

```
com.gameaday.homeassistant.sdPlugin/   Plugin bundle (install this)
├── manifest.json                       Plugin metadata & action definitions
├── bin/plugin.js                       Compiled plugin code (generated)
├── imgs/                               Icons & images
└── ui/                                 Property inspector HTML files

src/                                    TypeScript source code
├── plugin.ts                           Entry point
├── ha-client.ts                        Home Assistant REST API client
├── settings.ts                         Shared settings type definitions
└── actions/
    ├── toggle-entity.ts
    ├── call-service.ts
    ├── monitor-state.ts
    └── activate-scene.ts
```

---

## Development

```sh
# Watch mode – rebuilds on every save
npm run watch
```

Enable debug mode in the manifest (`"Debug": "enabled"`) to attach a Node.js debugger on port 9229.

---

## License

MIT © Gameaday
