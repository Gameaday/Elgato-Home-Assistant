import streamDeck from "@elgato/streamdeck";

import { ToggleEntity } from "./actions/toggle-entity.js";
import { CallService } from "./actions/call-service.js";
import { MonitorState } from "./actions/monitor-state.js";
import { ActivateScene } from "./actions/activate-scene.js";
import { HaWsClient } from "./ha-client.js";
import { GlobalSettings } from "./settings.js";

streamDeck.logger.setLevel("debug");

// Register all actions
streamDeck.actions.registerAction(new ToggleEntity());
streamDeck.actions.registerAction(new CallService());
streamDeck.actions.registerAction(new MonitorState());
streamDeck.actions.registerAction(new ActivateScene());

// Initialise the WebSocket client whenever global settings are received or change
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(({ settings }) => {
	if (settings.haUrl && settings.haToken) {
		HaWsClient.instance.configure(settings);
	}
});

// Re-connect the WebSocket client after the system wakes from sleep
streamDeck.system.onSystemDidWakeUp(() => {
	streamDeck.logger.info("System woke up – reconnecting HA WebSocket.");
	HaWsClient.instance.reconnect();
});

// Connect to the Stream Deck; triggers the initial getGlobalSettings round-trip
streamDeck.connect();
