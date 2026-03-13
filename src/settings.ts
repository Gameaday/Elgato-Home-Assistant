import type { JsonObject } from "@elgato/utils";

/**
 * Settings shared across all actions – stored as global settings in Stream Deck.
 */
export interface GlobalSettings extends JsonObject {
	/** Base URL of the Home Assistant instance, e.g. http://homeassistant.local:8123 */
	haUrl: string;
	/** Long-lived access token generated from the HA user profile page. */
	haToken: string;
}

/**
 * Settings for the Toggle Entity action.
 */
export interface ToggleSettings extends JsonObject {
	/** The entity_id to toggle, e.g. light.living_room */
	entityId?: string;
	/** Optional label shown on the key when the state is "on". */
	labelOn?: string;
	/** Optional label shown on the key when the state is "off". */
	labelOff?: string;
}

/**
 * Settings for the Call Service action.
 */
export interface CallServiceSettings extends JsonObject {
	/** HA domain, e.g. "light" */
	domain?: string;
	/** HA service name, e.g. "turn_on" */
	service?: string;
	/** JSON string containing optional service data payload. */
	serviceData?: string;
	/** Optional button label. */
	label?: string;
}

/**
 * Settings for the Monitor State action.
 */
export interface MonitorSettings extends JsonObject {
	/** The entity_id to monitor, e.g. sensor.outside_temperature */
	entityId?: string;
	/** How often to refresh the state (seconds). */
	pollInterval?: number;
	/** Optional unit to append to the displayed value. */
	unit?: string;
	/** Show the entity's friendly name as a subtitle on the key. */
	showName?: boolean;
}

/**
 * Settings for the Activate Scene action.
 */
export interface SceneSettings extends JsonObject {
	/** Full entity_id of the scene, e.g. scene.movie_night */
	entityId?: string;
	/** Optional label shown on the key. */
	label?: string;
}
