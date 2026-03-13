import {
	action,
	DialAction,
	DidReceiveSettingsEvent,
	KeyAction,
	SingletonAction,
	TouchTapEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { HaClient, HaState, HaWsClient, StateChangedCallback } from "../ha-client.js";
import { GlobalSettings, MonitorSettings } from "../settings.js";

const FALLBACK_POLL_INTERVAL_S = 30;

/**
 * Monitor State action.
 *
 * Displays the live state of any Home Assistant entity directly on the
 * Stream Deck key or dial touchscreen.
 *
 * **Keypad**: Shows state as the button title.
 * **Encoder (Stream Deck +)**: Shows entity name, value, and unit on the
 * touchscreen via a custom layout. Touch to force-refresh.
 *
 * Primarily driven by real-time WebSocket events; a configurable polling
 * interval acts as a fallback when the WS is unavailable.
 */
@action({ UUID: "com.gameaday.homeassistant.monitor" })
export class MonitorState extends SingletonAction<MonitorSettings> {
	/** Map from action id → { entityId, callback } for clean WS unsubscription. */
	private readonly wsSubscriptions = new Map<string, { entityId: string; callback: StateChangedCallback }>();
	private readonly pollTimers = new Map<string, ReturnType<typeof setInterval>>();

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	override async onWillAppear(ev: WillAppearEvent<MonitorSettings>): Promise<void> {
		const { settings } = ev.payload;

		await this.syncState(ev.action, settings);
		this.registerWsSubscription(ev.action, settings);
		this.startPollFallback(ev.action, settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<MonitorSettings>): void {
		this.cleanup(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<MonitorSettings>): Promise<void> {
		const { settings } = ev.payload;

		this.cleanup(ev.action.id);
		await this.syncState(ev.action, settings);
		this.registerWsSubscription(ev.action, settings);
		this.startPollFallback(ev.action, settings);
	}

	// ── Encoder events ───────────────────────────────────────────────────────

	/** Touch the touchscreen → force refresh state. */
	override async onTouchTap(ev: TouchTapEvent<MonitorSettings>): Promise<void> {
		await this.syncState(ev.action, ev.payload.settings);
	}

	// ── WebSocket ─────────────────────────────────────────────────────────────

	private registerWsSubscription(
		action: KeyAction<MonitorSettings> | DialAction<MonitorSettings>,
		settings: MonitorSettings
	): void {
		if (!settings.entityId) return;

		const callback: StateChangedCallback = (_entityId, newState) => {
			this.applyStateToAction(action, settings, newState).catch((err) =>
				streamDeck.logger.warn(`Monitor WS update error: ${err}`)
			);
		};

		this.wsSubscriptions.set(action.id, { entityId: settings.entityId, callback });
		HaWsClient.instance.subscribe(settings.entityId, callback);
	}

	// ── Polling fallback ──────────────────────────────────────────────────────

	private startPollFallback(
		action: KeyAction<MonitorSettings> | DialAction<MonitorSettings>,
		settings: MonitorSettings
	): void {
		if (!settings.entityId) return;

		const intervalMs = Math.max(5_000, (settings.pollInterval ?? FALLBACK_POLL_INTERVAL_S) * 1_000);

		const timer = setInterval(() => {
			// Only poll when WS is not connected so we don't duplicate work
			if (!HaWsClient.instance.isConnected) {
				this.syncState(action, settings).catch((err) =>
					streamDeck.logger.warn(`Monitor poll error: ${err}`)
				);
			}
		}, intervalMs);

		this.pollTimers.set(action.id, timer);
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

	private async syncState(
		action: KeyAction<MonitorSettings> | DialAction<MonitorSettings>,
		settings: MonitorSettings
	): Promise<void> {
		if (!settings.entityId) return;

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		if (!global.haUrl || !global.haToken) return;

		try {
			const client = new HaClient(global);
			const state = await client.getState(settings.entityId);
			await this.applyStateToAction(action, settings, state);
		} catch (err) {
			streamDeck.logger.warn(`Monitor syncState error: ${err}`);
		}
	}

	private async applyStateToAction(
		action: KeyAction<MonitorSettings> | DialAction<MonitorSettings>,
		settings: MonitorSettings,
		state: HaState
	): Promise<void> {
		const rawValue = state.state;
		const unit = settings.unit?.trim() ?? "";
		const value = unit ? `${rawValue} ${unit}` : rawValue;

		const friendlyName =
			(state.attributes["friendly_name"] as string | undefined) ??
			settings.entityId?.split(".")[1]?.replace(/_/g, " ") ?? "";

		if (action.isKey()) {
			const title = settings.showName && friendlyName
				? `${friendlyName}\n${value}`
				: value;
			await action.setTitle(title);
		}

		if (action.isDial()) {
			const feedback: Record<string, string> = {
				title: friendlyName,
				value: rawValue
			};
			if (unit) {
				feedback.unit = unit;
			}
			await action.setFeedback(feedback);
		}
	}
}

