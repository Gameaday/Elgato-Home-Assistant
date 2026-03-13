  "port": 9229,
  "skipFiles": ["<node_internals>/**"]
}
```
---
## Current Repository Status
The repo at `/home/runner/work/Elgato-Home-Assistant/Elgato-Home-Assistant` currently contains:
- ✅ README.md (project description)
- ❌ No source code yet
**Next steps would be to initialize:**
1. npm init (or copy template)
2. Create src/plugin.ts
3. Create src/actions/ directory
4. Create manifest.json with action definitions
5. Create property inspector HTML files
6. Set up build configuration (tsconfig.json, rollup.config.mjs)
EOF
cat /tmp/elgato_research.md
                EC=$?
                echo "___BEGIN___COMMAND_DONE_MARKER___$EC"
            }
___BEGIN___COMMAND_OUTPUT_MARKER___
# Elgato Stream Deck Plugin Development Research

## 1. Plugin Structure Using @elgato/streamdeck SDK (v2.0.2 - Latest)

### Directory Layout
The modern SDK (v2.0.2) uses a TypeScript-first approach with the following structure:

```
my-plugin/
├── src/
│   ├── plugin.ts              # Main plugin entry point
│   ├── actions/
│   │   ├── home-assistant-toggle.ts
│   │   ├── home-assistant-scene.ts
│   │   └── ... (one file per action)
│   └── properties/
│       └── inspector.html     # Property inspector UI
├── ui/                         # UI files (if needed)
│   └── increment-counter.html
├── my-plugin.sdPlugin/        # Plugin bundle directory
│   ├── manifest.json          # Plugin metadata
│   ├── bin/                   # Compiled output
│   ├── imgs/                  # Assets
│   └── logs/                  # Runtime logs
├── package.json               # Project dependencies
├── tsconfig.json              # TypeScript configuration
├── rollup.config.mjs          # Build configuration
└── README.md
```

### Key Files Needed
1. **manifest.json** - Plugin metadata and action definitions
2. **package.json** - Dependencies and build scripts
3. **Action TypeScript classes** - Using `@action` decorator and `SingletonAction`
4. **Property Inspector HTML** - UI for action configuration
5. **Plugin entry point** - Connects and initializes actions
6. **Build configuration** - TypeScript + Rollup for bundling

---

## 2. manifest.json Format

### Complete Structure
```json
{
  "SDKVersion": 2,
  "Author": "Your Name",
  "CodePath": "bin/plugin.js",
  "Description": "Control Home Assistant from Stream Deck",
  "Name": "Home Assistant Plugin",
  "Icon": "imgs/icon",
  "URL": "https://your-website.com",
  "Version": "1.0.0",
  "Software": {
    "MinimumVersion": "5.0"
  },
  "OS": [
    {
      "Platform": "mac",
      "MinimumVersion": "10.11"
    },
    {
      "Platform": "windows",
      "MinimumVersion": "10"
    }
  ],
  "Category": "Home Assistant",
  "CategoryIcon": "imgs/category-icon",
  "Nodejs": {
    "Version": "20",
    "Debug": "enabled"
  },
  "Actions": [
    {
      "Icon": "imgs/action-icon",
      "Name": "Toggle Light",
      "UUID": "com.elgato.homeassistant.toggle-light",
      "Controllers": ["Keypad", "Encoder"],
      "States": [
        {
          "Image": "imgs/toggle-light-on",
          "Name": "On"
        },
        {
          "Image": "imgs/toggle-light-off",
          "Name": "Off"
        }
      ],
      "Tooltip": "Toggle a Home Assistant light entity",
      "PropertyInspectorPath": "inspectors/toggle-light.html",
      "Encoder": {
        "layout": "$B1",
        "TriggerDescription": {
          "Rotate": "Adjust brightness",
          "Push": "Toggle light",
          "Touch": "Open property inspector",
          "LongTouch": "Long touch action"
        }
      }
    }
  ]
}
```

### Key Fields Explained
- **SDKVersion**: Always 2 for current SDK
- **CodePath**: Path to compiled plugin JS (in bin/)
- **Nodejs**: Specifies Node.js version and debug mode
- **Actions**: Array of action definitions
- **UUID**: Unique identifier (reverse domain notation recommended)
- **Controllers**: What devices can use this action (Keypad, Encoder, Pedal, Touchscreen)
- **States**: Multiple visual states (0/1) for stateful actions
- **PropertyInspectorPath**: Path to action settings UI

---

## 3. TypeScript Patterns with @elgato/streamdeck SDK

### Basic Action Pattern

```typescript
import { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

/**
 * Home Assistant Toggle Light Action
 */
@action({ UUID: "com.elgato.homeassistant.toggle-light" })
export class ToggleLightAction extends SingletonAction<ToggleLightSettings> {
    /**
     * When user presses the button
     */
    async onKeyDown(ev: KeyDownEvent<ToggleLightSettings>) {
        const { action, payload } = ev;
        const settings = payload.settings;
        
        // Call Home Assistant API
        await this.toggleEntity(settings.entityId);
        
        // Provide visual feedback
        await action.setTitle("Toggled!");
    }

    /**
     * When action appears on Stream Deck
     */
    async onWillAppear(ev: WillAppearEvent<ToggleLightSettings>) {
        const { action, payload } = ev;
        const state = await this.getEntityState(payload.settings.entityId);
        
        // Set image based on current state
        if (state === "on") {
            await action.setImage("imgs/light-on.png");
        } else {
            await action.setImage("imgs/light-off.png");
        }
    }

    /**
     * When settings change from property inspector
     */
    async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ToggleLightSettings>) {
        console.log("Settings updated:", ev.payload.settings);
    }

    // Helper methods
    private async toggleEntity(entityId: string): Promise<void> {
        // Implementation calling Home Assistant API
    }

    private async getEntityState(entityId: string): Promise<string> {
        // Implementation
        return "on" | "off";
    }
}

// Define the settings type
interface ToggleLightSettings {
    entityId: string;
    friendlyName?: string;
    haUrl: string;
    haToken: string;
}
```

### Dial Action Pattern (for Stream Deck +)

```typescript
import { action, DialRotateEvent, SingletonAction } from "@elgato/streamdeck";

@action({ UUID: "com.elgato.homeassistant.brightness-dial" })
export class BrightnessDialAction extends SingletonAction<BrightnessSettings> {
    async onDialRotate(ev: DialRotateEvent<BrightnessSettings>) {
        const { action, payload } = ev;
        const settings = payload.settings;
        
        // ev.payload.ticks is positive/negative for rotation direction
        const newBrightness = await this.adjustBrightness(
            settings.entityId,
            payload.ticks
        );
        
        await action.setTitle(`${newBrightness}%`);
    }

    async onDialDown(ev: DialDownEvent<BrightnessSettings>) {
        // Handle dial press
    }

    async onTouchTap(ev: TouchTapEvent<BrightnessSettings>) {
        // Handle touchscreen tap (Stream Deck +)
    }
}

interface BrightnessSettings {
    entityId: string;
    step: number; // brightness step per rotation tick
}
```

### Available Events

```typescript
// Key-related events
onKeyDown?: (ev: KeyDownEvent) => Promise<void> | void;
onKeyUp?: (ev: KeyUpEvent) => Promise<void> | void;

// Dial-related events (Stream Deck +)
onDialDown?: (ev: DialDownEvent) => Promise<void> | void;
onDialRotate?: (ev: DialRotateEvent) => Promise<void> | void;
onDialUp?: (ev: DialUpEvent) => Promise<void> | void;

// Touchscreen events (Stream Deck +)
onTouchTap?: (ev: TouchTapEvent) => Promise<void> | void;

// Lifecycle events
onWillAppear?: (ev: WillAppearEvent) => Promise<void> | void;
onWillDisappear?: (ev: WillDisappearEvent) => Promise<void> | void;

// Settings events
onDidReceiveSettings?: (ev: DidReceiveSettingsEvent) => Promise<void> | void;
onDidReceiveResources?: (ev: DidReceiveResourcesEvent) => Promise<void> | void;

// Property inspector events
onPropertyInspectorDidAppear?: (ev: PropertyInspectorDidAppearEvent) => Promise<void> | void;
onPropertyInspectorDidDisappear?: (ev: PropertyInspectorDidDisappearEvent) => Promise<void> | void;
onSendToPlugin?: (ev: SendToPluginEvent) => Promise<void> | void;

// Metadata events
onTitleParametersDidChange?: (ev: TitleParametersDidChangeEvent) => Promise<void> | void;
```

### Action Methods (Available on `ev.action`)

```typescript
// Display methods
await action.setTitle(text, options);
await action.setImage(imageData, options);
await action.setState(0 | 1);          // For multi-state actions
await action.showOk();                 // Green checkmark

// Feedback (Stream Deck +)
await action.setFeedback(feedbackPayload);
await action.setFeedbackLayout("$B1");

// Settings
await action.setSettings(settings);
const settings = await action.getSettings();

// Communication
await action.sendToPropertyInspector(data);

// Properties
action.id;                             // Unique context ID
action.manifestId;                     // Action UUID from manifest
action.coordinates;                    // {row, column} for keys
action.isInMultiAction();              // Boolean
```

### Plugin Entry Point (plugin.ts)

```typescript
import { streamDeck } from "@elgato/streamdeck";

// Import all actions
import "./actions/toggle-light";
import "./actions/brightness-dial";
import "./actions/call-scene";

// Connect to Stream Deck
streamDeck.connect();

// Optional: Listen to plugin-level events
streamDeck.profiles.onDidOpen(async (profile) => {
    console.log(`Profile opened: ${profile.name}`);
});

streamDeck.system.onDidWakeUp(() => {
    console.log("System woke up");
});

// Access global settings
await streamDeck.settings.getGlobalSettings();
await streamDeck.settings.setGlobalSettings({ theme: "dark" });
```

---

## 4. Property Inspector HTML

### Complete Property Inspector Example

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Toggle Light - Settings</title>
    
    <!-- Stream Deck CSS Framework -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@elgato/streamdeck@2.0.0/dist/ui/css/sdpi.css" />
    
    <style>
        body {
            background-color: transparent;
        }
        
        .entity-list {
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
    </style>
</head>

<body>
    <div class="sdpi-wrapper">
        <!-- Header -->
        <div class="sdpi-heading">Home Assistant Settings</div>
        
        <!-- Connection Section -->
        <div class="sdpi-item">
            <div class="sdpi-item-label">Home Assistant URL</div>
            <input 
                class="sdpi-item-value"
                id="ha-url"
                type="text"
                placeholder="http://192.168.1.100:8123"
                value=""
            />
        </div>
        
        <div class="sdpi-item">
            <div class="sdpi-item-label">Long-Lived Token</div>
            <input 
                class="sdpi-item-value"
                id="ha-token"
                type="password"
                placeholder="Paste your token here"
                value=""
            />
        </div>
        
        <!-- Entity Selection -->
        <div class="sdpi-item">
            <div class="sdpi-item-label">Entity</div>
            <select class="sdpi-item-value" id="entity-select">
                <option value="">-- Loading entities --</option>
            </select>
        </div>
        
        <!-- Advanced Options (Tabs) -->
        <div type="tabs" class="sdpi-item">
            <div class="sdpi-item-label empty"></div>
            <div class="tabs">
                <div class="tab selected" data-target="#tab-basic">Basic</div>
                <div class="tab" data-target="#tab-advanced">Advanced</div>
            </div>
        </div>
        
        <hr class="tab-separator">
        
        <div id="tab-basic" class="tab-container" style="display: block;">
            <div class="sdpi-item">
                <div class="sdpi-item-label">Friendly Name</div>
                <input 
                    class="sdpi-item-value"
                    id="friendly-name"
                    type="text"
                    placeholder="Display name"
                />
            </div>
        </div>
        
        <div id="tab-advanced" class="tab-container" style="display: none;">
            <div class="sdpi-item">
                <div class="sdpi-item-label">Custom Feedback</div>
                <input 
                    class="sdpi-item-value"
                    id="custom-feedback"
                    type="checkbox"
                />
            </div>
        </div>
        
        <!-- Status Display -->
        <div class="sdpi-info-label">
            <span id="status">Not connected</span>
        </div>
    </div>

    <!-- Stream Deck Bridge Scripts -->
    <script>
        /**
         * The property inspector can communicate with the plugin
         */
        const PI = window.$PI || {};
        
        // Initialize when connected to Stream Deck
        PI.onConnected = (jsn) => {
            const { actionInfo, appInfo, connection, messageType, port, uuid } = jsn;
            const { payload } = actionInfo;
            const { settings } = payload;
            
            // Load saved settings into form
            document.getElementById("ha-url").value = settings.haUrl || "";
            document.getElementById("ha-token").value = settings.haToken || "";
            document.getElementById("entity-select").value = settings.entityId || "";
            document.getElementById("friendly-name").value = settings.friendlyName || "";
            document.getElementById("custom-feedback").checked = settings.customFeedback || false;
            
            // Load available entities from Home Assistant
            loadEntities();
        };
        
        // Send settings to plugin when input changes
        document.querySelectorAll("input, select").forEach(el => {
            el.addEventListener("change", () => {
                const settings = {
                    haUrl: document.getElementById("ha-url").value,
                    haToken: document.getElementById("ha-token").value,
                    entityId: document.getElementById("entity-select").value,
                    friendlyName: document.getElementById("friendly-name").value,
                    customFeedback: document.getElementById("custom-feedback").checked,
                };
                
                PI.setSettings(settings);
            });
            
            // Also save on input for real-time updates
            el.addEventListener("input", () => {
                // Debounced version in production
                PI.setSettings({
                    haUrl: document.getElementById("ha-url").value,
                    haToken: document.getElementById("ha-token").value,
                    entityId: document.getElementById("entity-select").value,
                    friendlyName: document.getElementById("friendly-name").value,
                    customFeedback: document.getElementById("custom-feedback").checked,
                });
            });
        });
        
        // Tab functionality
        function activateTabs(activeTab) {
            const allTabs = Array.from(document.querySelectorAll(".tab"));
            allTabs.forEach(el => {
                el.onclick = () => clickTab(el);
            });
        }
        
        function clickTab(clickedTab) {
            const allTabs = Array.from(document.querySelectorAll(".tab"));
            allTabs.forEach(el => el.classList.remove("selected"));
            clickedTab.classList.add("selected");
            
            allTabs.forEach(el => {
                if (el.dataset.target) {
                    const target = document.querySelector(el.dataset.target);
                    if (target) {
                        target.style.display = el === clickedTab ? "block" : "none";
                    }
                }
            });
        }
        
        activateTabs();
        
        // Load entities from Home Assistant
        async function loadEntities() {
            const haUrl = document.getElementById("ha-url").value;
            const haToken = document.getElementById("ha-token").value;
            
            if (!haUrl || !haToken) {
                document.getElementById("status").textContent = "Missing credentials";
                return;
            }
            
            try {
                const response = await fetch(`${haUrl}/api/states`, {
                    headers: {
                        "Authorization": `Bearer ${haToken}`,
                    },
                });
                
                const entities = await response.json();
                const select = document.getElementById("entity-select");
                select.innerHTML = '<option value="">-- Select entity --</option>';
                
                // Filter to light entities for example
                entities
                    .filter(e => e.entity_id.startsWith("light."))
                    .forEach(entity => {
                        const option = document.createElement("option");
                        option.value = entity.entity_id;
                        option.textContent = entity.attributes.friendly_name || entity.entity_id;
                        select.appendChild(option);
                    });
                
                document.getElementById("status").textContent = "Connected";
            } catch (error) {
                document.getElementById("status").textContent = `Error: ${error.message}`;
            }
        }
    </script>
</body>
</html>
```

### Key Property Inspector Concepts

1. **PI Object**: Global `$PI` object provided by Stream Deck for communication
2. **PI.onConnected()**: Called when inspector connects to Stream Deck
3. **PI.setSettings()**: Send settings to the plugin
4. **PI.onConnected payload**: Contains action info, app info, current settings

---

## 5. package.json Structure

### Complete package.json Example

```json
{
  "name": "elgato-home-assistant",
  "version": "1.0.0",
  "description": "Control Home Assistant from Elgato Stream Deck",
  "type": "module",
  "main": "dist/plugin/index.js",
  "engines": {
    "node": ">=20.5.1"
  },
  "scripts": {
    "build": "npm run clean && npm run compile && npm run bundle",
    "clean": "rm -rf dist bin",
    "compile": "tsc",
    "bundle": "rollup -c rollup.config.mjs",
    "watch": "npm run clean && npm run compile -- --watch",
    "dev": "npm run watch & npm run debug",
    "debug": "streamdeck build -o",
    "test": "vitest --run",
    "test:watch": "vitest",
    "lint": "eslint src --max-warnings 0",
    "lint:fix": "prettier src --write"
  },
  "dependencies": {
    "@elgato/streamdeck": "^2.0.2",
    "@elgato/utils": "^0.4.1",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@elgato/cli": "^1.7.3",
    "@elgato/eslint-config": "^0.3.2",
    "@elgato/prettier-config": "^0.3.3",
    "@tsconfig/node20": "^20.1.4",
    "@types/node": "^20.5.2",
    "@typescript-eslint/eslint-plugin": "^6.5.0",
    "@typescript-eslint/parser": "^6.5.0",
    "eslint": "^8.48.0",
    "prettier": "^3.0.3",
    "rollup": "^4.0.0",
    "rollup-plugin-typescript2": "^0.36.0",
    "typescript": "^5.2.2",
    "vitest": "^1.0.0"
  },
  "prettier": "@elgato/prettier-config",
  "eslintConfig": {
    "extends": "@elgato/eslint-config"
  }
}
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `@elgato/streamdeck` | Official SDK for Stream Deck plugins |
| `@elgato/cli` | CLI tools for building and bundling plugins |
| `@elgato/utils` | Utility functions (logging, i18n, etc.) |
| `axios` or `node-fetch` | HTTP client for Home Assistant API |
| `rollup` | Module bundler for final plugin |
| `typescript` | TypeScript compiler |
| `@tsconfig/node20` | Recommended TS config for Node 20 |

---

## 6. Additional Important Concepts

### Decorators
The `@action` decorator registers an action with Stream Deck:

```typescript
@action({ UUID: "com.elgato.homeassistant.toggle-light" })
export class ToggleLightAction extends SingletonAction { }
```

### Settings Type Safety
Define TypeScript interfaces for type-safe settings:

```typescript
interface HomeAssistantSettings {
    haUrl: string;
    haToken: string;
    entityId: string;
    friendlyName?: string;
}

// Used in action class
export class MyAction extends SingletonAction<HomeAssistantSettings> { }
```

### Communication Patterns
- **Plugin → Inspector**: `action.sendToPropertyInspector(data)`
- **Inspector → Plugin**: `PI.setSettings()` or custom messages
- **Plugin → Stream Deck**: All `set*` methods on `action` object

### Debugging
- Enable debugging in manifest: `"Debug": "enabled"`
- Connect debugger to `localhost:9229` (or random port shown in logs)
- Use VS Code with launch config:

```json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to plugin",
  "port": 9229,
  "skipFiles": ["<node_internals>/**"]
}
```

---

## Current Repository Status

The repo at `/home/runner/work/Elgato-Home-Assistant/Elgato-Home-Assistant` currently contains:
- ✅ README.md (project description)
- ❌ No source code yet

**Next steps would be to initialize:**
1. npm init (or copy template)
2. Create src/plugin.ts
3. Create src/actions/ directory
4. Create manifest.json with action definitions
5. Create property inspector HTML files
6. Set up build configuration (tsconfig.json, rollup.config.mjs)
___BEGIN___COMMAND_DONE_MARKER___0
