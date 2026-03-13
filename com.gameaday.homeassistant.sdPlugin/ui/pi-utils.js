/**
 * pi-utils.js  (v3 – SDK 3 compatible, with entity search)
 * Shared utilities for all Home Assistant Stream Deck property inspectors.
 *
 * Each inspector calls `HAPI.initPI({ ... })` to wire up the Stream Deck
 * WebSocket, then calls `HAPI.loadEntities(...)` to populate entity pickers.
 */
(function (global) {
	"use strict";

	/** Internal state shared across all functions in this module. */
	const state = {
		ws:       null,
		uuid:     null,
		haUrl:    "",
		haToken:  "",
		settings: {}
	};

	// ── Initialise PI ─────────────────────────────────────────────────────────

	/**
	 * Initialise the property inspector.
	 *
	 * @param {object} opts
	 * @param {(settings: object, globalSettings: object) => void} opts.onSettings
	 *   Called whenever settings or global settings are received from Stream Deck.
	 * @param {(payload: object) => void} [opts.onPluginMessage]
	 *   Called when the plugin sends a message to the property inspector.
	 */
	function initPI(opts) {
		global.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, _info, actionInfo) { // eslint-disable-line no-unused-vars
			state.uuid = uuid;

			// Parse initial action settings from the actionInfo payload
			try {
				const ai = typeof actionInfo === "string" ? JSON.parse(actionInfo) : actionInfo;
				state.settings = ai?.payload?.settings ?? {};
			} catch (_) { /* ignore */ }

			const ws = new WebSocket(`ws://127.0.0.1:${port}`);
			state.ws = ws;

			ws.onopen = () => {
				_send({ event: registerEvent, uuid });
				_send({ event: "getGlobalSettings", context: uuid });
			};

			ws.onmessage = (msg) => {
				let data;
				try { data = JSON.parse(msg.data); } catch (_) { return; }

				switch (data.event) {
					case "didReceiveGlobalSettings": {
						const gs = data.payload?.settings ?? {};
						state.haUrl   = gs.haUrl   ?? "";
						state.haToken = gs.haToken ?? "";
						opts?.onSettings?.(state.settings, gs);
						break;
					}
					case "didReceiveSettings": {
						state.settings = data.payload?.settings ?? {};
						opts?.onSettings?.(state.settings, { haUrl: state.haUrl, haToken: state.haToken });
						break;
					}
					case "sendToPropertyInspector": {
						opts?.onPluginMessage?.(data.payload);
						break;
					}
				}
			};
		};
	}

	// ── Settings ──────────────────────────────────────────────────────────────

	/**
	 * Persist action-level settings to Stream Deck (merges with existing).
	 * @param {object} newSettings
	 */
	function saveSettings(newSettings) {
		Object.assign(state.settings, newSettings);
		_send({
			event:   "setSettings",
			context: state.uuid,
			payload: state.settings
		});
	}

	/**
	 * Persist global (plugin-level) settings to Stream Deck.
	 * @param {object} newSettings
	 */
	function saveGlobalSettings(newSettings) {
		_send({
			event:   "setGlobalSettings",
			context: state.uuid,
			payload: newSettings
		});
	}

	// ── Entity loader ─────────────────────────────────────────────────────────

	/** Cached list of entities fetched from HA, keyed by selectId. */
	const _entityCache = new Map();

	/**
	 * Fetch all Home Assistant entity states and populate a `<select>` element.
	 * Entities are grouped by domain and sorted alphabetically.
	 *
	 * @param {string}   selectId    ID of the `<select>` element to populate.
	 * @param {string[]} domains     Only include entities in these domains.
	 *                               Pass [] or omit to include every domain.
	 * @param {string}   [selectedId]  entity_id to pre-select.
	 */
	async function loadEntities(selectId, domains, selectedId) {
		const sel = document.getElementById(selectId);
		if (!sel) return;

		if (!state.haUrl || !state.haToken) {
			sel.innerHTML = '<option value="">⚠ Configure connection in plugin settings</option>';
			return;
		}

		sel.disabled = true;
		sel.innerHTML = '<option value="">Loading entities…</option>';

		try {
			const baseUrl = state.haUrl.replace(/\/+$/, "");
			const res = await fetch(`${baseUrl}/api/states`, {
				headers: { "Authorization": `Bearer ${state.haToken}` }
			});

			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

			/** @type {Array<{entity_id: string, state: string, attributes: object}>} */
			const entities = await res.json();

			// Filter by domain (if requested)
			const filtered = domains?.length
				? entities.filter(e => domains.includes(e.entity_id.split(".")[0]))
				: entities;

			// Cache for search filtering
			_entityCache.set(selectId, { filtered, selectedId });

			_renderEntities(sel, filtered, selectedId, "");
		} catch (err) {
			sel.innerHTML = `<option value="">⚠ ${err.message}</option>`;
		} finally {
			sel.disabled = false;
		}
	}

	/**
	 * Render filtered entities into the select element.
	 * @param {HTMLSelectElement} sel
	 * @param {Array} entities
	 * @param {string} selectedId
	 * @param {string} search
	 */
	function _renderEntities(sel, entities, selectedId, search) {
		const searchLower = (search || "").toLowerCase();

		// Filter by search string (entity_id or friendly_name)
		const matching = searchLower
			? entities.filter(e => {
				const name = (e.attributes?.friendly_name ?? "").toLowerCase();
				return e.entity_id.toLowerCase().includes(searchLower) || name.includes(searchLower);
			})
			: entities;

		// Group by domain, then sort within each group
		const byDomain = new Map();
		for (const e of matching) {
			const domain = e.entity_id.split(".")[0];
			if (!byDomain.has(domain)) byDomain.set(domain, []);
			byDomain.get(domain).push(e);
		}
		for (const arr of byDomain.values()) {
			arr.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
		}
		const sortedDomains = [...byDomain.keys()].sort();

		// Track all rendered entity IDs to check if selected one is present
		const renderedIds = new Set();

		sel.innerHTML = '<option value="">— Select entity —</option>';

		for (const domain of sortedDomains) {
			const group = document.createElement("optgroup");
			group.label = domain;

			for (const e of byDomain.get(domain)) {
				const opt  = document.createElement("option");
				opt.value  = e.entity_id;
				const name = e.attributes?.friendly_name ?? e.entity_id.split(".")[1];
				opt.textContent = `${name} (${e.entity_id})`;
				if (e.entity_id === selectedId) opt.selected = true;
				renderedIds.add(e.entity_id);
				group.appendChild(opt);
			}

			sel.appendChild(group);
		}

		// Preserve any previously-saved value even if it's not in the filtered list
		if (selectedId && !renderedIds.has(selectedId)) {
			const fallback   = document.createElement("option");
			fallback.value   = selectedId;
			fallback.textContent = `${selectedId} (not in list)`;
			fallback.selected = true;
			sel.prepend(fallback);
		}
	}

	/**
	 * Wire up a search input to filter a pre-loaded entity select.
	 *
	 * @param {string} searchInputId  ID of the <input> used as a search box.
	 * @param {string} selectId       ID of the <select> populated by loadEntities.
	 */
	function enableEntitySearch(searchInputId, selectId) {
		const input = document.getElementById(searchInputId);
		const sel   = document.getElementById(selectId);
		if (!input || !sel) return;

		// Keep cached selectedId in sync when user changes the dropdown
		sel.addEventListener("change", () => {
			const cached = _entityCache.get(selectId);
			if (cached) cached.selectedId = sel.value;
		});

		input.addEventListener("input", () => {
			const cached = _entityCache.get(selectId);
			if (!cached) return;
			_renderEntities(sel, cached.filtered, cached.selectedId, input.value);
		});
	}

	// ── Connection test ───────────────────────────────────────────────────────

	/**
	 * Test the current HA connection and resolve with the HA version string,
	 * or reject with an error message.
	 *
	 * @param {string} haUrl
	 * @param {string} haToken
	 * @returns {Promise<string>} HA version, e.g. "2024.3.3"
	 */
	async function testConnection(haUrl, haToken) {
		const baseUrl = (haUrl || "").replace(/\/+$/, "");
		if (!baseUrl || !haToken) throw new Error("URL and token are required.");

		const res = await fetch(`${baseUrl}/api/`, {
			headers: { "Authorization": `Bearer ${haToken}` }
		});

		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		const body = await res.json();
		return body.version ?? "connected";
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	function _send(obj) {
		if (state.ws?.readyState === WebSocket.OPEN) {
			state.ws.send(JSON.stringify(obj));
		}
	}

	// ── Exports ───────────────────────────────────────────────────────────────
	global.HAPI = { initPI, saveSettings, saveGlobalSettings, loadEntities, enableEntitySearch, testConnection };
})(window);

