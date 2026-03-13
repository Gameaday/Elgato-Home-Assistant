import {
	action,
	DidReceiveSettingsEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	streamDeck
} from "@elgato/streamdeck";

import { HaClient } from "../ha-client.js";
import { GlobalSettings, MonitorSettings } from "../settings.js";

const DEFAULT_POLL_INTERVAL = 10; // seconds

/**
 * Monitor State action.
 *
 * Displays the live state of any Home Assistant entity directly on the
 * Stream Deck key. Supports all entity types – sensors, lights, switches,
 * binary sensors, climate, and more.
 *
 * The state value and (optionally) the entity's friendly name are shown as
 * the key title. The poll interval is configurable per button.
 */
@action({ UUID: "com.gameaday.homeassistant.monitor" })
export class MonitorState extends SingletonAction<MonitorSettings> {
	private pollingTimers = new Map<string, ReturnType<typeof setInterval>>();

	override async onWillAppear(ev: WillAppearEvent<MonitorSettings>): Promise<void> {
		await this.refreshState(ev.action.id, ev.payload.settings);
		this.startPolling(ev.action.id, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<MonitorSettings>): void {
		this.stopPolling(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<MonitorSettings>): Promise<void> {
		this.stopPolling(ev.action.id);
		await this.refreshState(ev.action.id, ev.payload.settings);
		this.startPolling(ev.action.id, ev.payload.settings);
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	private startPolling(actionId: string, settings: MonitorSettings): void {
		if (!settings.entityId) return;

		const intervalSec = Math.max(1, settings.pollInterval || DEFAULT_POLL_INTERVAL);
		const timer = setInterval(() => {
			this.refreshState(actionId, settings).catch((err) =>
				streamDeck.logger.warn(`Monitor poll error: ${err}`)
			);
		}, intervalSec * 1000);

		this.pollingTimers.set(actionId, timer);
	}

	private stopPolling(actionId: string): void {
		const timer = this.pollingTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.pollingTimers.delete(actionId);
		}
	}

	private async refreshState(actionId: string, settings: MonitorSettings): Promise<void> {
		if (!settings.entityId) return;

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!global.haUrl || !global.haToken) return;

		try {
			const client = new HaClient(global);
			const state = await client.getState(settings.entityId);

			const value = settings.unit ? `${state.state} ${settings.unit}` : state.state;
			const friendlyName = settings.showName
				? ((state.attributes["friendly_name"] as string | undefined) ?? "")
				: "";

			// Build a two-line title: name on top, value below (or just value)
			const title = friendlyName ? `${friendlyName}\n${value}` : value;

			for (const act of this.actions) {
				if (act.id !== actionId) continue;
				await act.setTitle(title);
			}
		} catch (err) {
			streamDeck.logger.warn(`Monitor refreshState error: ${err}`);
		}
	}
}
