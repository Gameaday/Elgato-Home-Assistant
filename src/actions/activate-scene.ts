import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	streamDeck
} from "@elgato/streamdeck";

import { HaClient } from "../ha-client.js";
import { GlobalSettings, SceneSettings } from "../settings.js";

/**
 * Activate Scene action.
 *
 * Activates a Home Assistant scene when the key is pressed.
 * The scene entity_id is selected via the property inspector; a human-readable
 * name is derived automatically from the entity_id when no custom label is set.
 */
@action({ UUID: "com.gameaday.homeassistant.scene" })
export class ActivateScene extends SingletonAction<SceneSettings> {
	override async onWillAppear(ev: WillAppearEvent<SceneSettings>): Promise<void> {
		await this.updateTitle(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SceneSettings>): Promise<void> {
		await this.updateTitle(ev.action, ev.payload.settings);
	}

	/** Activates the configured scene when the key is pressed. */
	override async onKeyDown(ev: KeyDownEvent<SceneSettings>): Promise<void> {
		const { settings } = ev.payload;

		if (!settings.entityId) {
			streamDeck.logger.warn("ActivateScene: no scene entity_id configured.");
			await ev.action.showAlert();
			return;
		}

		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

		if (!global.haUrl || !global.haToken) {
			streamDeck.logger.error("ActivateScene: Home Assistant URL or token not configured.");
			await ev.action.showAlert();
			return;
		}

		try {
			const client = new HaClient(global);
			await client.activateScene(settings.entityId);
			await ev.action.showOk();
		} catch (err) {
			streamDeck.logger.error(`ActivateScene failed: ${err}`);
			await ev.action.showAlert();
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private async updateTitle(
		action: { setTitle(t: string): Promise<void> },
		settings: SceneSettings
	): Promise<void> {
		const label = settings.label?.trim() || this.friendlySceneName(settings.entityId);
		if (label) {
			await action.setTitle(label);
		}
	}

	/**
	 * Derives a human-readable name from a scene entity_id.
	 * e.g. "scene.movie_night" → "Movie Night"
	 */
	private friendlySceneName(entityId?: string): string {
		if (!entityId) return "";
		const id = entityId.replace(/^scene\./, "");
		return id
			.split(/[_\-]/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
	}
}
