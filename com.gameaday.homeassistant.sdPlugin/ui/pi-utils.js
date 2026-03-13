/**
 * pi-utils.js
 * Shared utilities for all Home Assistant Stream Deck property inspectors.
 *
 * Each inspector calls `initPI({ ... })` to wire up the Stream Deck WebSocket
 * and the Home Assistant entity picker.
 */
(function (global) {
	"use strict";

	/** Internal state shared across all functions in this module. */
	const state = {
		ws: null,
		uuid: null,
		haUrl: "",
		haToken: "",
		settings: {}
	};

	/**
	 * Initialise the property inspector.
	 *
	 * @param {object} opts
	 * @param {(settings: object, globalSettings: object) => void} opts.onSettings
	 *   Called whenever settings or global settings are received.
	 */
	function initPI(opts) {
		global.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, info, actionInfo) {
			state.uuid = uuid;

			// Parse initial settings from actionInfo
			try {
				const ai = typeof actionInfo === "string" ? JSON.parse(actionInfo) : actionInfo;
				state.settings = ai?.payload?.settings ?? {};
			} catch (_) { /* ignore */ }

			const ws = new WebSocket(`ws://127.0.0.1:${port}`);
			state.ws = ws;

			ws.onopen = () => {
				send({ event: registerEvent, uuid });
				send({ event: "getGlobalSettings", context: uuid });
			};

			ws.onmessage = (msg) => {
				const data = JSON.parse(msg.data);

				if (data.event === "didReceiveGlobalSettings") {
					const gs = data.payload?.settings ?? {};
					state.haUrl   = gs.haUrl   ?? "";
					state.haToken = gs.haToken ?? "";
					if (opts?.onSettings) opts.onSettings(state.settings, gs);
				}

				if (data.event === "didReceiveSettings") {
					state.settings = data.payload?.settings ?? {};
					if (opts?.onSettings) opts.onSettings(state.settings, { haUrl: state.haUrl, haToken: state.haToken });
				}

				if (data.event === "sendToPropertyInspector") {
					if (opts?.onPluginMessage) opts.onPluginMessage(data.payload);
				}
			};
		};
	}

	/**
	 * Persist action-level settings to Stream Deck.
	 * @param {object} newSettings  Merged into the existing settings object.
	 */
	function saveSettings(newSettings) {
		Object.assign(state.settings, newSettings);
		send({
			event: "setSettings",
			context: state.uuid,
			payload: state.settings
		});
	}

	/**
	 * Fetch all Home Assistant entity states and populate a <select> element.
	 *
	 * @param {string}   selectId  ID of the <select> element to populate.
	 * @param {string[]} domains   Only include entities whose domain is in this list.
	 *                             Pass an empty array or omit to include all entities.
	 * @param {string}   [selectedId]  entity_id to pre-select.
	 */
	async function loadEntities(selectId, domains, selectedId) {
		const sel = document.getElementById(selectId);
		if (!sel) return;

		if (!state.haUrl || !state.haToken) {
			sel.innerHTML = '<option value="">⚠ Configure connection in global settings</option>';
			return;
		}

		sel.classList.add("loading");
		sel.innerHTML = '<option value="">Loading…</option>';

		try {
			const baseUrl = state.haUrl.replace(/\/+$/, "");
			const res = await fetch(`${baseUrl}/api/states`, {
				headers: { "Authorization": `Bearer ${state.haToken}` }
			});

			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const entities = await res.json();

			// Filter by domain if requested
			const filtered = (domains && domains.length > 0)
				? entities.filter(e => domains.includes(e.entity_id.split(".")[0]))
				: entities;

			// Sort alphabetically by entity_id
			filtered.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

			sel.innerHTML = '<option value="">— Select entity —</option>';
			filtered.forEach(e => {
				const opt = document.createElement("option");
				opt.value = e.entity_id;
				const name = e.attributes?.friendly_name ?? e.entity_id;
				opt.textContent = `${name} (${e.entity_id})`;
				if (e.entity_id === selectedId) opt.selected = true;
				sel.appendChild(opt);
			});

			if (selectedId && !filtered.find(e => e.entity_id === selectedId)) {
				// Add it anyway so the current value isn't lost
				const fallback = document.createElement("option");
				fallback.value = selectedId;
				fallback.textContent = selectedId;
				fallback.selected = true;
				sel.appendChild(fallback);
			}
		} catch (err) {
			sel.innerHTML = `<option value="">⚠ Error: ${err.message}</option>`;
		} finally {
			sel.classList.remove("loading");
		}
	}

	// ── Internal helper ──────────────────────────────────────────────────────
	function send(obj) {
		if (state.ws && state.ws.readyState === WebSocket.OPEN) {
			state.ws.send(JSON.stringify(obj));
		}
	}

	// ── Exports ──────────────────────────────────────────────────────────────
	global.HAPI = { initPI, saveSettings, loadEntities };
})(window);
