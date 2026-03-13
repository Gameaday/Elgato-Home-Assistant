import { GlobalSettings } from "./settings.js";

/**
 * Represents a Home Assistant entity state response.
 */
export interface HaState {
	entity_id: string;
	state: string;
	attributes: Record<string, unknown>;
	last_changed: string;
	last_updated: string;
	friendly_name?: string;
}

/**
 * Lightweight Home Assistant REST API client.
 *
 * All requests use the long-lived access token stored in global settings.
 * Errors are thrown so callers can surface them via Stream Deck feedback.
 */
export class HaClient {
	private baseUrl: string;
	private token: string;

	constructor(settings: GlobalSettings) {
		// Strip trailing slash for consistent URL construction
		this.baseUrl = settings.haUrl.replace(/\/+$/, "");
		this.token = settings.haToken;
	}

	/**
	 * Builds common HTTP headers for all API requests.
	 */
	private get headers(): Record<string, string> {
		return {
			"Authorization": `Bearer ${this.token}`,
			"Content-Type": "application/json"
		};
	}

	/**
	 * Returns the current state of a single entity.
	 */
	async getState(entityId: string): Promise<HaState> {
		const response = await fetch(`${this.baseUrl}/api/states/${encodeURIComponent(entityId)}`, {
			method: "GET",
			headers: this.headers
		});

		if (!response.ok) {
			throw new Error(`Failed to get state for ${entityId}: ${response.status} ${response.statusText}`);
		}

		return (await response.json()) as HaState;
	}

	/**
	 * Returns all entity states from Home Assistant.
	 */
	async getAllStates(): Promise<HaState[]> {
		const response = await fetch(`${this.baseUrl}/api/states`, {
			method: "GET",
			headers: this.headers
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch all states: ${response.status} ${response.statusText}`);
		}

		return (await response.json()) as HaState[];
	}

	/**
	 * Calls a Home Assistant service.
	 * @param domain  - The service domain, e.g. "light"
	 * @param service - The service name, e.g. "turn_on"
	 * @param data    - Optional service data payload
	 */
	async callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<void> {
		const response = await fetch(`${this.baseUrl}/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
			method: "POST",
			headers: this.headers,
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			throw new Error(`Failed to call service ${domain}.${service}: ${response.status} ${response.statusText}`);
		}
	}

	/**
	 * Toggles an entity by calling homeassistant.toggle.
	 */
	async toggle(entityId: string): Promise<void> {
		await this.callService("homeassistant", "toggle", { entity_id: entityId });
	}

	/**
	 * Activates a scene.
	 */
	async activateScene(entityId: string): Promise<void> {
		await this.callService("scene", "turn_on", { entity_id: entityId });
	}

	/**
	 * Verifies connectivity by hitting the HA API root.
	 * Throws if the connection fails or the token is invalid.
	 */
	async ping(): Promise<void> {
		const response = await fetch(`${this.baseUrl}/api/`, {
			method: "GET",
			headers: this.headers
		});

		if (!response.ok) {
			throw new Error(`Cannot reach Home Assistant at ${this.baseUrl}: ${response.status} ${response.statusText}`);
		}
	}
}
