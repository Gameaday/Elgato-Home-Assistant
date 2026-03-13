import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	streamDeck
} from "@elgato/streamdeck";

import { HaClient } from "../ha-client.js";
import { GlobalSettings, ToggleSettings } from "../settings.js";

/**
 * Toggle Entity action.
 *
 * Toggles a Home Assistant entity (light, switch, input_boolean, fan, …) on
 * or off when the key is pressed.  The button image and title automatically
 * reflect the live entity state (on / off).
 */
@action({ UUID: "com.gameaday.homeassistant.toggle" })
export class ToggleEntity extends SingletonAction<ToggleSettings> {
	/** Per-action polling timers keyed by action context id. */
	private pollingTimers = new Map<string, ReturnType<typeof setInterval>>();

	/**
	 * Called when a key that uses this action becomes visible on the deck.
	 * Starts polling the entity state to keep the button in sync.
	 */
	override async onWillAppear(ev: WillAppearEvent<ToggleSettings>): Promise<void> {
		await this.refreshState(ev.action.id, ev.payload.settings);
		this.startPolling(ev.action.id, ev.payload.settings);
	}

	/**
	 * Called when the key is no longer visible (profile change, page switch, etc.).
	 * Stops the polling timer to avoid unnecessary network traffic.
	 */
	override onWillDisappear(ev: WillDisappearEvent<ToggleSettings>): void {
		this.stopPolling(ev.action.id);
	}

	/**
	 * Called when the user updates settings in the property inspector.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ToggleSettings>): Promise<void> {
		this.stopPolling(ev.action.id);
		await this.refreshState(ev.action.id, ev.payload.settings);
		this.startPolling(ev.action.id, ev.payload.settings);
	}

	/**
	 * Called when the key is pressed – toggles the entity.
	 */
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
			// Refresh immediately after toggling so the button reflects the new state
			await this.refreshState(ev.action.id, settings);
		} catch (err) {
			streamDeck.logger.error(`Toggle failed: ${err}`);
			await ev.action.showAlert();
		}
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	private startPolling(actionId: string, settings: ToggleSettings): void {
		if (!settings.entityId) return;
		const timer = setInterval(() => {
			this.refreshState(actionId, settings).catch((err) =>
				streamDeck.logger.warn(`Toggle poll error: ${err}`)
			);
		}, 5000);
		this.pollingTimers.set(actionId, timer);
	}

	private stopPolling(actionId: string): void {
		const timer = this.pollingTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.pollingTimers.delete(actionId);
		}
	}

	/**
	 * Fetches the current entity state and updates the key image + title.
	 */
	private async refreshState(actionId: string, settings: ToggleSettings): Promise<void> {
		if (!settings.entityId) return;

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!global.haUrl || !global.haToken) return;

		try {
			const client = new HaClient(global);
			const state = await client.getState(settings.entityId);
			const isOn = state.state === "on";

			// Update only key actions (setState is not available on DialAction)
			for (const act of this.actions) {
				if (act.id !== actionId) continue;
				// setState only exists on KeyAction (not DialAction)
				if ("setState" in act && typeof act.setState === "function") {
					await (act as { setState(s: number): Promise<void> }).setState(isOn ? 1 : 0);
				}
				const label = isOn
					? (settings.labelOn ?? state.state)
					: (settings.labelOff ?? state.state);
				await act.setTitle(label || "");
			}
		} catch (err) {
			streamDeck.logger.warn(`Toggle refreshState error: ${err}`);
		}
	}
}
