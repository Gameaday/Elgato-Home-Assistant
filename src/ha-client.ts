import streamDeck from "@elgato/streamdeck";
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
}

/** Callback invoked when an entity's state changes. */
export type StateChangedCallback = (entityId: string, newState: HaState) => void;

// ─── REST Client ─────────────────────────────────────────────────────────────

/**
 * Lightweight Home Assistant REST API client.
 *
 * All requests use the long-lived access token stored in global settings.
 * Errors are thrown so callers can surface them via Stream Deck feedback.
 */
export class HaClient {
	private baseUrl: string;
	private token: string;

	constructor(settings: Pick<GlobalSettings, "haUrl" | "haToken">) {
		// Strip trailing slash for consistent URL construction
		this.baseUrl = settings.haUrl.replace(/\/+$/, "");
		this.token = settings.haToken;
	}

	private get headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.token}`,
			"Content-Type": "application/json"
		};
	}

	/** Returns the current state of a single entity. */
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

	/** Returns all entity states from Home Assistant. */
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
		const response = await fetch(
			`${this.baseUrl}/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
			{
				method: "POST",
				headers: this.headers,
				body: JSON.stringify(data)
			}
		);

		if (!response.ok) {
			throw new Error(
				`Failed to call service ${domain}.${service}: ${response.status} ${response.statusText}`
			);
		}
	}

	/** Toggles an entity by calling homeassistant.toggle. */
	async toggle(entityId: string): Promise<void> {
		await this.callService("homeassistant", "toggle", { entity_id: entityId });
	}

	/** Activates a scene. */
	async activateScene(entityId: string): Promise<void> {
		await this.callService("scene", "turn_on", { entity_id: entityId });
	}

	/**
	 * Sets the brightness of a light entity.
	 * @param entityId - light entity, e.g. "light.living_room"
	 * @param brightness - 0–255
	 */
	async setBrightness(entityId: string, brightness: number): Promise<void> {
		const clamped = Math.max(0, Math.min(255, Math.round(brightness)));
		if (clamped === 0) {
			await this.callService("light", "turn_off", { entity_id: entityId });
		} else {
			await this.callService("light", "turn_on", { entity_id: entityId, brightness: clamped });
		}
	}

	/**
	 * Verifies connectivity by hitting the HA API root and returns the HA version string.
	 * Throws if the connection fails or the token is invalid.
	 */
	async ping(): Promise<string> {
		const response = await fetch(`${this.baseUrl}/api/`, {
			method: "GET",
			headers: this.headers
		});

		if (!response.ok) {
			throw new Error(
				`Cannot reach Home Assistant at ${this.baseUrl}: ${response.status} ${response.statusText}`
			);
		}

		const body = (await response.json()) as { version?: string; message?: string };
		return body.version ?? "unknown";
	}
}

// ─── WebSocket Client ─────────────────────────────────────────────────────────

const WS_RECONNECT_DELAY_MS = 5_000;
const WS_AUTH_TIMEOUT_MS = 10_000;

type WsMessage = Record<string, unknown>;

/**
 * Singleton WebSocket client for the Home Assistant WebSocket API.
 *
 * Provides real-time entity state subscriptions (`state_changed` events) that
 * are far more efficient than polling.  Multiple actions can register
 * callbacks for different entities; the client maintains a single connection
 * and routes events to the correct subscribers.
 *
 * Usage:
 *   const ws = HaWsClient.instance;
 *   ws.subscribe("light.living_room", callback);
 *   // later:
 *   ws.unsubscribe("light.living_room", callback);
 */
export class HaWsClient {
	// ── Singleton ────────────────────────────────────────────────────────────
	private static _instance: HaWsClient | null = null;

	static get instance(): HaWsClient {
		if (!HaWsClient._instance) {
			HaWsClient._instance = new HaWsClient();
		}
		return HaWsClient._instance;
	}

	// ── State ────────────────────────────────────────────────────────────────
	private ws: WebSocket | null = null;
	private haUrl = "";
	private haToken = "";
	private connected = false;
	private msgId = 1;
	private subscriptionId: number | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	/** Map from entity_id → set of registered callbacks. */
	private readonly subscribers = new Map<string, Set<StateChangedCallback>>();

	private constructor() {}

	// ── Public API ────────────────────────────────────────────────────────────

	/** Force-closes the current connection and re-establishes it with the current credentials. */
	reconnect(): void {
		if (!this.haUrl || !this.haToken) return;
		streamDeck.logger.info("[HaWsClient] Reconnecting on request.");
		this.disconnect();
		this.connect();
	}

	/**
	 * Configure (or reconfigure) the WebSocket client with new HA credentials.
	 * If the credentials change the existing connection is closed and a new one
	 * is established.
	 */
	configure(settings: Pick<GlobalSettings, "haUrl" | "haToken">): void {
		const newUrl = settings.haUrl?.replace(/\/+$/, "") ?? "";
		const newToken = settings.haToken ?? "";

		if (newUrl === this.haUrl && newToken === this.haToken && this.connected) {
			return; // Already connected with the same credentials
		}

		this.haUrl = newUrl;
		this.haToken = newToken;
		this.disconnect();

		if (this.haUrl && this.haToken) {
			this.connect();
		}
	}

	/**
	 * Subscribe to state-change events for an entity.
	 * The callback fires immediately after registering if there is no active connection
	 * (the next state push will update the button).
	 */
	subscribe(entityId: string, callback: StateChangedCallback): void {
		if (!this.subscribers.has(entityId)) {
			this.subscribers.set(entityId, new Set());
		}
		this.subscribers.get(entityId)!.add(callback);
	}

	/** Remove a previously registered callback. */
	unsubscribe(entityId: string, callback: StateChangedCallback): void {
		this.subscribers.get(entityId)?.delete(callback);
		if (this.subscribers.get(entityId)?.size === 0) {
			this.subscribers.delete(entityId);
		}
	}

	/** Returns true when the WebSocket is authenticated and ready. */
	get isConnected(): boolean {
		return this.connected;
	}

	// ── Internals ─────────────────────────────────────────────────────────────

	private get wsUrl(): string {
		// Replace http(s) with ws(s)
		return this.haUrl.replace(/^http/, "ws") + "/api/websocket";
	}

	private connect(): void {
		if (this.ws) return; // Already connecting

		try {
			this.ws = new WebSocket(this.wsUrl);
		} catch (err) {
			streamDeck.logger.error(`[HaWsClient] Failed to create WebSocket: ${err}`);
			this.scheduleReconnect();
			return;
		}

		let authTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
			streamDeck.logger.warn("[HaWsClient] Auth timeout – reconnecting.");
			this.ws?.close();
		}, WS_AUTH_TIMEOUT_MS);

		this.ws.onopen = () => {
			streamDeck.logger.info("[HaWsClient] Connection opened.");
		};

		this.ws.onmessage = (event: { data: string }) => {
			let msg: WsMessage;
			try {
				msg = JSON.parse(event.data) as WsMessage;
			} catch {
				return;
			}

			const type = msg["type"] as string | undefined;

			if (type === "auth_required") {
				this.send({ type: "auth", access_token: this.haToken });
				return;
			}

			if (type === "auth_ok") {
				if (authTimeout) {
					clearTimeout(authTimeout);
					authTimeout = null;
				}
				streamDeck.logger.info("[HaWsClient] Authenticated.");
				this.connected = true;
				this.subscribeToStateChanges();
				return;
			}

			if (type === "auth_invalid") {
				streamDeck.logger.error("[HaWsClient] Authentication failed – check your HA token.");
				this.ws?.close();
				return;
			}

			if (type === "event") {
				this.handleEvent(msg);
			}
		};

		this.ws.onerror = () => {
			streamDeck.logger.warn("[HaWsClient] WebSocket error.");
		};

		this.ws.onclose = () => {
			if (authTimeout) {
				clearTimeout(authTimeout);
				authTimeout = null;
			}
			streamDeck.logger.info("[HaWsClient] Connection closed.");
			this.ws = null;
			this.connected = false;
			this.subscriptionId = null;
			this.scheduleReconnect();
		};
	}

	private disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
		this.ws = null;
		this.connected = false;
		this.subscriptionId = null;
	}

	private scheduleReconnect(): void {
		if (!this.haUrl || !this.haToken) return;
		if (this.reconnectTimer) return;
		streamDeck.logger.info(`[HaWsClient] Reconnecting in ${WS_RECONNECT_DELAY_MS / 1000}s…`);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, WS_RECONNECT_DELAY_MS);
	}

	private subscribeToStateChanges(): void {
		const id = this.msgId++;
		this.subscriptionId = id;
		this.send({ id, type: "subscribe_events", event_type: "state_changed" });
		streamDeck.logger.info(`[HaWsClient] Subscribed to state_changed (msg id ${id}).`);
	}

	private handleEvent(msg: WsMessage): void {
		const event = msg["event"] as WsMessage | undefined;
		if (!event) return;

		const eventType = event["event_type"] as string | undefined;
		if (eventType !== "state_changed") return;

		const data = event["data"] as WsMessage | undefined;
		if (!data) return;

		const entityId = data["entity_id"] as string | undefined;
		const newState = data["new_state"] as HaState | undefined;

		if (!entityId || !newState) return;

		const callbacks = this.subscribers.get(entityId);
		if (!callbacks || callbacks.size === 0) return;

		for (const cb of callbacks) {
			try {
				cb(entityId, newState);
			} catch (err) {
				streamDeck.logger.warn(`[HaWsClient] Callback error for ${entityId}: ${err}`);
			}
		}
	}

	private send(msg: WsMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}
}
