import streamDeck from "@elgato/streamdeck";

import { ToggleEntity } from "./actions/toggle-entity.js";
import { CallService } from "./actions/call-service.js";
import { MonitorState } from "./actions/monitor-state.js";
import { ActivateScene } from "./actions/activate-scene.js";
import { HaWsClient } from "./ha-client.js";
import { GlobalSettings } from "./settings.js";

// Use info-level logging in production; change to "debug" during development
streamDeck.logger.setLevel("info");

// ── Register all actions ─────────────────────────────────────────────────────
streamDeck.actions.registerAction(new ToggleEntity());
streamDeck.actions.registerAction(new CallService());
streamDeck.actions.registerAction(new MonitorState());
streamDeck.actions.registerAction(new ActivateScene());

// ── Global settings → WebSocket client ───────────────────────────────────────
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(({ settings }) => {
	if (settings.haUrl && settings.haToken) {
		HaWsClient.instance.configure(settings);
	}
});

// ── System wake → reconnect WS ──────────────────────────────────────────────
streamDeck.system.onSystemDidWakeUp(() => {
	streamDeck.logger.info("System woke up – reconnecting HA WebSocket.");
	HaWsClient.instance.reconnect();
});

// ── Deep link support ────────────────────────────────────────────────────────
// Allows external apps to trigger plugin actions via:
//   streamdeck://plugins/message/com.gameaday.homeassistant/{message}
streamDeck.system.onDidReceiveDeepLink(async (ev) => {
	const path = ev.url.path;
	streamDeck.logger.info(`Deep link received: ${ev.url.href}`);

	if (path === "open-ha" || path === "open") {
		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (global.haUrl) {
			await streamDeck.system.openUrl(global.haUrl);
		}
	}
});

// ── Connect ──────────────────────────────────────────────────────────────────
streamDeck.connect();

