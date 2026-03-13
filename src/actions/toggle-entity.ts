import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	KeyAction,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	streamDeck
} from "@elgato/streamdeck";

import { HaClient, HaState, HaWsClient, StateChangedCallback } from "../ha-client.js";
import { GlobalSettings, ToggleSettings } from "../settings.js";

/**
 * Toggle Entity action.
 *
 * Toggles a Home Assistant entity (light, switch, input_boolean, fan, …) on
 * or off when the key is pressed.  The button image and title automatically
 * reflect the live entity state via real-time WebSocket events, with a REST
 * API fallback for the initial render.
 */
@action({ UUID: "com.gameaday.homeassistant.toggle" })
export class ToggleEntity extends SingletonAction<ToggleSettings> {
	/** Map from action id → { entityId, callback } for clean WS unsubscription. */
	private readonly wsSubscriptions = new Map<string, { entityId: string; callback: StateChangedCallback }>();

	override async onWillAppear(ev: WillAppearEvent<ToggleSettings>): Promise<void> {
		const { settings } = ev.payload;
		if (!ev.action.isKey()) return;

		await this.syncState(ev.action, settings);
		this.registerWsSubscription(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<ToggleSettings>): void {
		this.removeWsSubscription(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ToggleSettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		const { settings } = ev.payload;

		this.removeWsSubscription(ev.action.id);
		await this.syncState(ev.action, settings);
		this.registerWsSubscription(ev.action, settings);
	}

	/** Toggles the entity on key press. */
	override async onKeyDown(ev: KeyDownEvent<ToggleSettings>): Promise<void> {
		const { settings } = ev.payload;

		if (!settings.entityId) {
			await ev.action.showAlert();
			return;
		}

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

		if (!global.haUrl || !global.haToken) {
			await ev.action.showAlert();
			streamDeck.logger.error("Toggle: Home Assistant URL or token not configured.");
			return;
		}

		try {
			const client = new HaClient(global);
			await client.toggle(settings.entityId);
			// Sync state immediately after toggle; WS event will also arrive shortly
			await this.syncState(ev.action, settings);
		} catch (err) {
			streamDeck.logger.error(`Toggle failed: ${err}`);
			await ev.action.showAlert();
		}
	}

	// ── WebSocket helpers ────────────────────────────────────────────────────

	private registerWsSubscription(action: KeyAction<ToggleSettings>, settings: ToggleSettings): void {
		if (!settings.entityId) return;

		this.removeWsSubscription(action.id);

		const callback: StateChangedCallback = (_entityId, newState) => {
			this.applyState(action, settings, newState).catch((err) =>
				streamDeck.logger.warn(`Toggle WS state update error: ${err}`)
			);
		};

		this.wsSubscriptions.set(action.id, { entityId: settings.entityId, callback });
		HaWsClient.instance.subscribe(settings.entityId, callback);
	}

	private removeWsSubscription(actionId: string): void {
		const sub = this.wsSubscriptions.get(actionId);
		if (!sub) return;
		HaWsClient.instance.unsubscribe(sub.entityId, sub.callback);
		this.wsSubscriptions.delete(actionId);
	}

	// ── State helpers ─────────────────────────────────────────────────────────

	/**
	 * Fetches the current state via REST and updates the key image and title.
	 * Used on first appearance and immediately after a toggle press.
	 */
	private async syncState(action: KeyAction<ToggleSettings>, settings: ToggleSettings): Promise<void> {
		if (!settings.entityId) return;

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!global.haUrl || !global.haToken) return;

		try {
			const client = new HaClient(global);
			const state = await client.getState(settings.entityId);
			await this.applyState(action, settings, state);
		} catch (err) {
			streamDeck.logger.warn(`Toggle syncState error: ${err}`);
		}
	}

	/** Applies a HA state to the Stream Deck key (image state + title). */
	private async applyState(
		action: KeyAction<ToggleSettings>,
		settings: ToggleSettings,
		state: HaState
	): Promise<void> {
		const isOn = state.state === "on";
		await action.setState(isOn ? 1 : 0);

		const label = isOn
			? (settings.labelOn ?? state.state)
			: (settings.labelOff ?? state.state);
		await action.setTitle(label);
	}
}

