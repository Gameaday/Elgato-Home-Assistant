import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	streamDeck
} from "@elgato/streamdeck";

import { HaClient } from "../ha-client.js";
import { CallServiceSettings, GlobalSettings } from "../settings.js";

/**
 * Call Service action.
 *
 * Calls any Home Assistant service when the key is pressed.
 * The domain, service name, and optional JSON service-data payload are
 * configurable via the property inspector.
 */
@action({ UUID: "com.gameaday.homeassistant.call-service" })
export class CallService extends SingletonAction<CallServiceSettings> {
	override async onWillAppear(ev: WillAppearEvent<CallServiceSettings>): Promise<void> {
		const { settings } = ev.payload;
		const label = settings.label || `${settings.domain || "?"}.${settings.service || "?"}`;
		await ev.action.setTitle(label);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CallServiceSettings>): Promise<void> {
		const { settings } = ev.payload;
		const label = settings.label || `${settings.domain || "?"}.${settings.service || "?"}`;
		await ev.action.setTitle(label);
	}

	/**
	 * Calls the configured service when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<CallServiceSettings>): Promise<void> {
		const { settings } = ev.payload;

		if (!settings.domain || !settings.service) {
			streamDeck.logger.warn("CallService: domain or service not configured.");
			await ev.action.showAlert();
			return;
		}

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

		if (!global.haUrl || !global.haToken) {
			streamDeck.logger.error("CallService: Home Assistant URL or token not configured.");
			await ev.action.showAlert();
			return;
		}

		let serviceData: Record<string, unknown> = {};

		if (settings.serviceData) {
			try {
				serviceData = JSON.parse(settings.serviceData) as Record<string, unknown>;
			} catch {
				streamDeck.logger.error("CallService: Invalid JSON in service data field.");
				await ev.action.showAlert();
				return;
			}
		}

		try {
			const client = new HaClient(global);
			await client.callService(settings.domain, settings.service, serviceData);
			await ev.action.showOk();
		} catch (err) {
			streamDeck.logger.error(`CallService failed: ${err}`);
			await ev.action.showAlert();
		}
	}
}
