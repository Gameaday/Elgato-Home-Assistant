import {
	action,
	DidReceiveSettingsEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	streamDeck
} from "@elgato/streamdeck";

import { HaClient, HaState, HaWsClient, StateChangedCallback } from "../ha-client.js";
import { GlobalSettings, MonitorSettings } from "../settings.js";

const FALLBACK_POLL_INTERVAL_S = 30;

/**
 * Monitor State action.
 *
 * Displays the live state of any Home Assistant entity directly on the
 * Stream Deck key.  Primarily driven by real-time WebSocket events; a
 * configurable polling interval acts as a fallback when the WS is
 * unavailable.
 */
@action({ UUID: "com.gameaday.homeassistant.monitor" })
export class MonitorState extends SingletonAction<MonitorSettings> {
	/** Map from action id → { entityId, callback } for clean WS unsubscription. */
	private readonly wsSubscriptions = new Map<string, { entityId: string; callback: StateChangedCallback }>();
	private readonly pollTimers = new Map<string, ReturnType<typeof setInterval>>();

	override async onWillAppear(ev: WillAppearEvent<MonitorSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const { settings } = ev.payload;

		await this.syncState(ev.action.id, settings);
		this.registerWsSubscription(ev.action.id, settings);
		this.startPollFallback(ev.action.id, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<MonitorSettings>): void {
		this.cleanup(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<MonitorSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const { settings } = ev.payload;

		this.cleanup(ev.action.id);
		await this.syncState(ev.action.id, settings);
		this.registerWsSubscription(ev.action.id, settings);
		this.startPollFallback(ev.action.id, settings);
	}

	// ── WebSocket ─────────────────────────────────────────────────────────────

	private registerWsSubscription(actionId: string, settings: MonitorSettings): void {
		if (!settings.entityId) return;

		const callback: StateChangedCallback = (_entityId, newState) => {
			this.applyStateToAction(actionId, settings, newState).catch((err) =>
				streamDeck.logger.warn(`Monitor WS update error: ${err}`)
			);
		};

		this.wsSubscriptions.set(actionId, { entityId: settings.entityId, callback });
		HaWsClient.instance.subscribe(settings.entityId, callback);
	}

	// ── Polling fallback ──────────────────────────────────────────────────────

	private startPollFallback(actionId: string, settings: MonitorSettings): void {
		if (!settings.entityId) return;

		const intervalMs = Math.max(5_000, (settings.pollInterval ?? FALLBACK_POLL_INTERVAL_S) * 1_000);

		const timer = setInterval(() => {
			// Only poll when WS is not connected so we don't duplicate work
			if (!HaWsClient.instance.isConnected) {
				this.syncState(actionId, settings).catch((err) =>
					streamDeck.logger.warn(`Monitor poll error: ${err}`)
				);
			}
		}, intervalMs);

		this.pollTimers.set(actionId, timer);
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private cleanup(actionId: string): void {
		const sub = this.wsSubscriptions.get(actionId);
		if (sub) {
			HaWsClient.instance.unsubscribe(sub.entityId, sub.callback);
			this.wsSubscriptions.delete(actionId);
		}

		const timer = this.pollTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.pollTimers.delete(actionId);
		}
	}

	private async syncState(actionId: string, settings: MonitorSettings): Promise<void> {
		if (!settings.entityId) return;

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!global.haUrl || !global.haToken) return;

		try {
			const client = new HaClient(global);
			const state = await client.getState(settings.entityId);
			await this.applyStateToAction(actionId, settings, state);
		} catch (err) {
			streamDeck.logger.warn(`Monitor syncState error: ${err}`);
		}
	}

	private async applyStateToAction(
		actionId: string,
		settings: MonitorSettings,
		state: HaState
	): Promise<void> {
		const title = this.buildTitle(settings, state);

		for (const act of this.actions) {
			if (act.id !== actionId) continue;
			await act.setTitle(title);
		}
	}

	/** Builds the key title from the entity state and display settings. */
	private buildTitle(settings: MonitorSettings, state: HaState): string {
		const rawValue = state.state;
		const unit = settings.unit?.trim() ?? "";
		const value = unit ? `${rawValue} ${unit}` : rawValue;

		if (settings.showName) {
			const friendlyName =
				(state.attributes["friendly_name"] as string | undefined) ??
				settings.entityId?.split(".")[1]?.replace(/_/g, " ") ??
				"";
			return friendlyName ? `${friendlyName}\n${value}` : value;
		}

		return value;
	}
}

