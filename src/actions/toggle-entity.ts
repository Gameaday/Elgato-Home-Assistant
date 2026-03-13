import {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SingletonAction,
	TouchTapEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { HaClient, HaState, HaWsClient, StateChangedCallback } from "../ha-client.js";
import { GlobalSettings, ToggleSettings } from "../settings.js";

/** Brightness step per dial tick (0-255). */
const DIAL_BRIGHTNESS_STEP = 25;

/**
 * Toggle Entity action.
 *
 * Toggles a Home Assistant entity (light, switch, input_boolean, fan, …) on
 * or off when the key is pressed (or dial is pushed / touched).
 *
 * **Keypad**: Button image and title reflect live entity state via WebSocket
 * events, with a REST API fallback for the initial render.
 *
 * **Encoder (Stream Deck +)**: Push to toggle, rotate to adjust brightness
 * (lights only), touchscreen shows entity name and state via a custom layout.
 */
@action({ UUID: "com.gameaday.homeassistant.toggle" })
export class ToggleEntity extends SingletonAction<ToggleSettings> {
	/** Map from action id → { entityId, callback } for clean WS unsubscription. */
	private readonly wsSubscriptions = new Map<string, { entityId: string; callback: StateChangedCallback }>();

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	override async onWillAppear(ev: WillAppearEvent<ToggleSettings>): Promise<void> {
		const { settings } = ev.payload;
		await this.syncState(ev.action, settings);
		this.registerWsSubscription(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<ToggleSettings>): void {
		this.removeWsSubscription(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ToggleSettings>): Promise<void> {
		const { settings } = ev.payload;
		this.removeWsSubscription(ev.action.id);
		await this.syncState(ev.action, settings);
		this.registerWsSubscription(ev.action, settings);
	}

	// ── Key events ────────────────────────────────────────────────────────────

	override async onKeyDown(ev: KeyDownEvent<ToggleSettings>): Promise<void> {
		await this.handleToggle(ev.action, ev.payload.settings);
	}

	// ── Encoder (dial) events ─────────────────────────────────────────────────

	/** Push the dial → toggle. */
	override async onDialDown(ev: DialDownEvent<ToggleSettings>): Promise<void> {
		await this.handleToggle(ev.action, ev.payload.settings);
	}

	/** Touch the touchscreen → toggle. */
	override async onTouchTap(ev: TouchTapEvent<ToggleSettings>): Promise<void> {
		await this.handleToggle(ev.action, ev.payload.settings);
	}

	/** Rotate the dial → adjust brightness (lights only). */
	override async onDialRotate(ev: DialRotateEvent<ToggleSettings>): Promise<void> {
		const { settings } = ev.payload;
		if (!settings.entityId) return;

		// Only adjust brightness for light entities
		if (!settings.entityId.startsWith("light.")) return;

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!global.haUrl || !global.haToken) return;

		try {
			const client = new HaClient(global);
			const state = await client.getState(settings.entityId);

			const currentBrightness = (state.attributes["brightness"] as number | undefined) ?? 0;
			const newBrightness = currentBrightness + (ev.payload.ticks * DIAL_BRIGHTNESS_STEP);

			await client.setBrightness(settings.entityId, newBrightness);
		} catch (err) {
			streamDeck.logger.warn(`Toggle dial rotate failed: ${err}`);
		}
	}

	// ── Shared toggle logic ──────────────────────────────────────────────────

	private async handleToggle(
		action: KeyAction<ToggleSettings> | DialAction<ToggleSettings>,
		settings: ToggleSettings
	): Promise<void> {
		if (!settings.entityId) {
			await action.showAlert();
			return;
		}

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

		if (!global.haUrl || !global.haToken) {
			await action.showAlert();
			streamDeck.logger.error("Toggle: Home Assistant URL or token not configured.");
			return;
		}

		try {
			const client = new HaClient(global);
			await client.toggle(settings.entityId);
			// Sync state immediately after toggle; WS event will also arrive shortly
			await this.syncState(action, settings);
		} catch (err) {
			streamDeck.logger.error(`Toggle failed: ${err}`);
			await action.showAlert();
		}
	}

	// ── WebSocket helpers ────────────────────────────────────────────────────

	private registerWsSubscription(
		action: KeyAction<ToggleSettings> | DialAction<ToggleSettings>,
		settings: ToggleSettings
	): void {
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
	 * Fetches the current state via REST and updates the key/dial display.
	 */
	private async syncState(
		action: KeyAction<ToggleSettings> | DialAction<ToggleSettings>,
		settings: ToggleSettings
	): Promise<void> {
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

	/** Applies a HA state to the Stream Deck key or dial. */
	private async applyState(
		action: KeyAction<ToggleSettings> | DialAction<ToggleSettings>,
		settings: ToggleSettings,
		state: HaState
	): Promise<void> {
		const isOn = state.state === "on";

		if (action.isKey()) {
			await action.setState(isOn ? 1 : 0);
			const label = isOn
				? (settings.labelOn || state.state)
				: (settings.labelOff || state.state);
			await action.setTitle(label);
		}

		if (action.isDial()) {
			const friendlyName =
				(state.attributes["friendly_name"] as string | undefined) ??
				settings.entityId?.split(".")[1]?.replace(/_/g, " ") ?? "";

			await action.setFeedback({
				title: friendlyName,
				value: isOn ? "ON" : "OFF",
				icon: isOn
					? "imgs/actions/toggle/on.svg"
					: "imgs/actions/toggle/off.svg"
			});
		}
	}
}

