import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";

class Element {
	children = [];
	queries = new Map();
	attributes = new Map();
	value = "";
	textContent = "";
	append(...nodes) {
		for (const node of nodes) node.parent = this;
		this.children.push(...nodes);
	}
	replaceChildren() { this.children = []; }
	remove() {
		this.parent.children = this.parent.children.filter((node) => node !== this);
	}
	querySelector(key) {
		if (!this.queries.has(key)) this.queries.set(key, new Element());
		return this.queries.get(key);
	}
	attachShadow() { return this.shadow = new Element(); }
	setAttribute(name, value) { this.attributes.set(name, value); }
	focus() { this.focused = true; }
}

const source = readFileSync("public/widget/gorbach.js", "utf8");

async function mount(fetch) {
	const body = new Element();
	runInNewContext(source, {
		document: {
			currentScript: { dataset: { api: "/api/cbot/" } },
			baseURI: "http://localhost/",
			body,
			documentElement: { lang: "uk-UA" },
			querySelector: () => null,
			createElement: () => new Element(),
		},
		window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
		URL, fetch, AbortController, setTimeout, clearTimeout,
	});
	await setImmediate();
	return body.children[0].shadow.children[1];
}

test("hides the launcher when status disables chat", async () => {
	const widget = await mount(async (url, options) => {
		assert.equal(url.pathname, "/api/cbot/status");
		assert.equal(options.method, "GET");
		return Response.json({ ok: true, enabled: false });
	});
	assert.equal(widget.hidden, true);
});

test("renders localized chat, sends bounded history and clears it on reset", async () => {
	const requests = [];
	let resolveFirst;
	let networkDown = false;
	const reply = "<b>Приклад відповіді</b>";
	const widget = await mount(async (url, options) => {
		if (options.method === "GET") return Response.json({ ok: true, enabled: true });
		assert.equal(url.pathname, "/api/cbot/msg");
		requests.push(JSON.parse(options.body));
		if (networkDown) throw new Error("offline");
		if (requests.length === 1) {
			await new Promise((resolve) => { resolveFirst = resolve; });
		}
		return Response.json({ ok: true, reply });
	});
	const launcher = widget.querySelector(".launcher");
	const panel = widget.querySelector("section");
	const log = widget.querySelector(".conversation");
	const input = widget.querySelector("input");
	const reset = widget.querySelector(".reset");
	const form = widget.querySelector("form");
	const submit = (text) => {
		input.value = text;
		return form.onsubmit({ preventDefault() {} });
	};
	assert.equal(widget.hidden, false);
	launcher.onclick();
	assert.equal(launcher.attributes.get("aria-expanded"), "true");
	assert.equal(input.focused, true);
	assert.match(log.children[0].textContent, /ШІ-асистент/);
	await submit("а".repeat(801));
	assert.match(widget.querySelector(".error").textContent, /800/);
	assert.equal(requests.length, 0);
	const first = submit("Питання 1");
	assert.equal(reset.disabled, true);
	assert.equal(log.children.at(-1).attributes.get("role"), "status");
	await submit("ignored while busy");
	assert.equal(requests.length, 1);
	assert.deepEqual(requests[0], { text: "Питання 1", history: [] });
	resolveFirst();
	await first;
	assert.equal(log.children.at(-1).textContent, reply);
	assert.equal(log.children.at(-1).children.length, 0);
	for (let i = 2; i <= 8; i++) await submit("Питання " + i);
	const recent = requests.at(-1).history;
	assert.equal(recent.length, 12);
	assert.deepEqual(recent.slice(0, 2), [{ role: "user", text: "Питання 2" }, { role: "assistant", text: reply }]);
	networkDown = true;
	await submit("Повторити");
	assert.equal(input.value, "Повторити");
	assert.match(widget.querySelector(".error").textContent, /Не вдалося/);
	networkDown = false;
	panel.onkeydown({ key: "Escape", stopPropagation() {} });
	assert.equal(panel.hidden, true);
	launcher.onclick();
	assert.equal(log.children.at(-1).textContent, reply);
	reset.onclick();
	assert.equal(log.children.length, 1);
	await submit("Нове питання");
	assert.deepEqual(requests.at(-1), { text: "Нове питання", history: [] });
});
