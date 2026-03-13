import streamDeck from "@elgato/streamdeck";

import { ToggleEntity } from "./actions/toggle-entity.js";
import { CallService } from "./actions/call-service.js";
import { MonitorState } from "./actions/monitor-state.js";
import { ActivateScene } from "./actions/activate-scene.js";

// Set logging to trace level during development
streamDeck.logger.setLevel("trace");

// Register all actions
streamDeck.actions.registerAction(new ToggleEntity());
streamDeck.actions.registerAction(new CallService());
streamDeck.actions.registerAction(new MonitorState());
streamDeck.actions.registerAction(new ActivateScene());

// Connect to the Stream Deck
streamDeck.connect();
