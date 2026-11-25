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
	replaceChildren(...nodes) {
		this.children = [];
		this.append(...nodes);
	}
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

async function mount(fetch, api = "/api/cbot/", storage = new Map()) {
	const body = new Element();
	runInNewContext(source, {
		document: {
			currentScript: { dataset: { api } },
			baseURI: "http://localhost/",
			body,
			documentElement: { lang: "uk-UA" },
			querySelector: () => null,
			createElement: () => new Element(),
		},
		window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
		location: { href: "http://localhost/", hash: "" },
		localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
		URL, URLSearchParams, FormData, fetch, AbortController, setTimeout, clearTimeout,
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
	const log = widget.querySelector(".messages");
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
	await reset.onclick();
	assert.equal(log.children.length, 1);
	await submit("Нове питання");
	assert.deepEqual(requests.at(-1), { text: "Нове питання", history: [] });
});

test("restores a localized questionnaire, uploads a file and submits the review", async () => {
	const storage = new Map();
	const screen = (fields) => ({ lang: "ru", messages: [], ...fields });
	const review = screen({ review: {
		name: "Jana",
		email: "jana@example.com",
		products: [{ product: "blinds", title: "Жалюзи", answers: { count: "one" },
			questionLabels: { count: "Количество" }, answerLabels: { count: "Одно" } }],
	} });
	const calls = [
		["start", { lang: "uk", page: "http://localhost/" }, screen({ sid: "test", chips: [{ id: "quote", label: "Узнать стоимость" }] })],
		["msg", { sid: "test", chip: "quote" }, screen({ question: "Сколько окон?", progress: { step: 1, total: 4 }, multi: true, chips: [{ id: "one", label: "Одно" }] })],
		["msg", { sid: "test", chips: ["one"] }, screen({ question: "Добавьте фото", attachmentField: { id: "photo", type: "file" } })],
		["file", null, { file: { id: "one", name: "window.pdf" } }],
		["history", null, screen({ attachmentField: { id: "photo", type: "file" }, pendingAttachments: [{ id: "one", name: "window.pdf" }] })],
		["msg", { sid: "test", files: ["one"] }, screen({ question: "Как с вами связаться?", input: "phone" })],
		["msg", { sid: "test", text: "jana@example.com" }, review],
		["submit", { sid: "test" }, { lead_id: "GZ-2" }],
		["history", null, screen({ lead_id: "GZ-2" })],
	];
	const fetch = async (url, options) => {
		if (url.pathname === "/api/status") {
			assert.equal(url.searchParams.get("lang"), "uk");
			return Response.json({ enabled: true, public: true });
		}
		const [route, payload, data] = calls.shift();
		assert.equal(url.pathname, `/api/${route}`);
		if (payload) assert.deepEqual(JSON.parse(options.body), payload);
		if (route === "file") {
			assert.equal(options.body.get("sid"), "test");
			assert.equal(options.body.get("file").name, "window.pdf");
			assert.equal(options.headers["Content-Type"], undefined);
		}
		if (route === "history") assert.equal(url.searchParams.get("sid"), "test");
		return Response.json(data);
	};
	async function openWidget() {
		const widget = await mount(fetch, "/api", storage);
		assert.equal(widget.hidden, false);
		widget.querySelector(".launcher").onclick();
		await setImmediate();
		return widget;
	}
	let widget = await openWidget();
	const control = (label) => widget.querySelector(".survey").children.find((node) => node.textContent === label);
	await control("Узнать стоимость").onclick();
	assert.equal(widget.lang, "ru");
	assert.ok(control("Шаг 1 / 4"));
	control("Одно").onclick();
	await control("Подтвердить выбор").onclick();
	const picker = widget.querySelector(".survey").children.find((node) => node.type === "file");
	picker.files = [new File(["fixture"], "window.pdf")];
	await picker.onchange();
	assert.ok(control("window.pdf"));
	widget = await openWidget();
	assert.ok(control("window.pdf"));
	await control("Подтвердить вложения").onclick();
	const input = widget.querySelector("input");
	assert.equal(input.placeholder, "Телефон или эл. почта");
	input.value = "jana@example.com";
	await widget.querySelector("form").onsubmit({ preventDefault() {} });
	assert.ok(control("Жалюзи"));
	const answers = widget.querySelector(".survey").children.find((node) => node.children.length === 2);
	assert.deepEqual(answers.children.map((node) => node.textContent), ["Количество", "Одно"]);
	await control("Отправить заявку").onclick();
	assert.ok(control("Номер заявки: GZ-2"));
	widget = await openWidget();
	assert.ok(control("Номер заявки: GZ-2"));
	assert.equal(widget.querySelector("form").hidden, true);
	assert.equal(calls.length, 0);
});
