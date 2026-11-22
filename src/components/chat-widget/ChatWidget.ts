declare const WIDGET_CSS: string;

const script = document.currentScript as HTMLScriptElement | null;
const endpoint = script?.dataset.api;
if (endpoint && script) {
	const api = new URL(endpoint, document.baseURI);
	const mount = () => mountWidget(api);
	if (document.body) mount();
	else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

function mountWidget(api: URL) {
	if (document.querySelector("gorbach-chat")) return;
	const host = document.createElement("gorbach-chat");
	const root = host.attachShadow({ mode: "open" });
	document.body.append(host);
	const style = document.createElement("style");
	style.textContent = WIDGET_CSS;
	const language = document.documentElement.lang.toLowerCase().split("-")[0];
	const labels: Record<string, string[]> = {
		cs: ["Otevřít chat", "Zavřít chat", "Jak vám můžeme pomoci?", "Zpráva", "Odeslat", "Nový rozhovor", "Akci se nepodařilo dokončit. Zkuste to znovu."],
		en: ["Open chat", "Close chat", "How can we help you?", "Message", "Send", "New conversation", "Could not complete the request. Please try again."],
		de: ["Chat öffnen", "Chat schließen", "Wie können wir Ihnen helfen?", "Nachricht", "Senden", "Neues Gespräch", "Die Anfrage ist fehlgeschlagen. Bitte versuchen Sie es erneut."],
		ru: ["Открыть чат", "Закрыть чат", "Чем мы можем вам помочь?", "Сообщение", "Отправить", "Новый разговор", "Не удалось выполнить запрос. Попробуйте ещё раз."],
		uk: ["Відкрити чат", "Закрити чат", "Чим ми можемо вам допомогти?", "Повідомлення", "Надіслати", "Нова розмова", "Не вдалося виконати запит. Спробуйте ще раз."],
	};
	const lang = Object.hasOwn(labels, language) ? language : "cs";
	const [openLabel, closeLabel, greeting, inputLabel, sendLabel, resetLabel, errorLabel] = labels[lang];
	const widget = document.createElement("div");
	widget.className = "chat-widget";
	widget.lang = lang;
	widget.innerHTML = `<button type="button" class="launcher" aria-controls="chat" aria-expanded="false">
		<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2 1.8-6A8 8 0 1 1 20 11.5Z"/><path d="M7.5 9.5h8m-8 4h5"/></svg>
	</button><section id="chat" role="dialog" aria-labelledby="title" hidden>
		<header><strong id="title">Gorbach žaluzie</strong><button class="close" type="button">×</button></header>
		<button class="reset" type="button"></button>
		<div class="conversation" role="log"><p></p></div>
		<div class="error" role="alert"></div>
		<form><input required type="text"><button type="submit"></button></form>
	</section>`;
	root.append(style, widget);
	const launcher = widget.querySelector<HTMLButtonElement>(".launcher")!;
	const close = widget.querySelector<HTMLButtonElement>(".close")!;
	const panel = widget.querySelector("section")!;
	const message = widget.querySelector("p")!;
	launcher.setAttribute("aria-label", openLabel);
	close.setAttribute("aria-label", closeLabel);
	message.textContent = greeting;

	const list = widget.querySelector<HTMLElement>(".conversation")!;
	const form = widget.querySelector("form")!;
	const input = widget.querySelector("input")!;
	const send = form.querySelector("button")!;
	const reset = widget.querySelector<HTMLButtonElement>(".reset")!;
	const error = widget.querySelector<HTMLElement>(".error")!;
	input.placeholder = inputLabel;
	input.setAttribute("aria-label", inputLabel);
	send.textContent = sendLabel;
	reset.textContent = resetLabel;
	let sid = "";
	let ready = false;
	let busy = false;
	const storageKey = "gorbach-sid";
	try { sid = localStorage.getItem(storageKey) || ""; } catch {}

	function saveSession(id: string) {
		sid = id;
		try { localStorage.setItem(storageKey, id); } catch {}
	}

	async function request(route: string, body?: Record<string, string>) {
		const url = new URL(api);
		url.pathname = url.pathname.replace(/\/$/, "") + "/" + route;
		if (route === "history") url.searchParams.set("sid", sid);
		const response = await fetch(url, {
			method: body ? "POST" : "GET",
			credentials: "omit",
			headers: body ? { "Content-Type": "application/json" } : undefined,
			body: body && JSON.stringify(body),
		});
		const data = await response.json();
		if (!response.ok) {
			if (response.status === 404 && data.error === "unknown_session")
				throw new Error("unknown_session");
			throw new Error("request_failed");
		}
		return data;
	}

	function render(messages: { role: string; text: string }[], replace: boolean) {
		const fragment = document.createDocumentFragment();
		for (const item of messages) {
			const line = document.createElement("p");
			line.classList.toggle("visitor", item.role === "visitor");
			line.textContent = item.text;
			fragment.append(line);
		}
		if (replace) list.replaceChildren(fragment);
		else list.append(fragment);
		list.scrollTop = list.scrollHeight;
	}

	async function restore() {
		if (sid) {
			try {
				render((await request("history")).messages, true);
				ready = true;
				return;
			} catch (cause) {
				if (!(cause instanceof Error && cause.message === "unknown_session")) throw cause;
			}
		}
		const data = await request("start", { lang, page: location.href });
		saveSession(data.sid);
		render(data.messages, true);
		ready = true;
	}

	async function run(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		input.readOnly = send.disabled = reset.disabled = true;
		error.textContent = "";
		try {
			await action();
		} catch (cause) {
			error.textContent = errorLabel;
			if (cause instanceof Error && cause.message === "unknown_session") {
				ready = false;
				try { await restore(); } catch {}
			}
		} finally {
			busy = false;
			input.readOnly = send.disabled = false;
			reset.disabled = !ready;
		}
	}

	form.onsubmit = (event) => {
		event.preventDefault();
		const text = input.value.trim();
		if (!text) return;
		void run(async () => {
			if (!ready) await restore();
			const data = await request("msg", { sid, text });
			render(data.messages, false);
			input.value = "";
			input.focus();
		});
	};
	reset.onclick = () => void run(async () => {
		const data = await request("reset", { sid });
		saveSession(data.sid);
		ready = false;
		input.value = "";
		list.replaceChildren();
		await restore();
	});

	function handleToggle(open: boolean) {
		panel.hidden = !open;
		launcher.hidden = open;
		launcher.setAttribute("aria-expanded", String(open));
		(open ? close : launcher).focus();
		if (open && !ready) void run(restore);
	}
	launcher.onclick = () => handleToggle(true);
	close.onclick = () => handleToggle(false);
	widget.onkeydown = (event) => {
		if (event.key === "Escape" && !panel.hidden) handleToggle(false);
	};

	// The stand supplies the configured greeting when its API is available.
	const status = new URL(api);
	status.pathname = status.pathname.replace(/\/$/, "") + "/status";
	status.searchParams.set("lang", lang);
	void fetch(status, { credentials: "omit" }).then(async (response) => {
		if (!response.ok) return;
		const config = await response.json();
		if (typeof config.start?.greeting === "string") message.textContent = config.start.greeting;
		if (typeof config.enabled !== "boolean" || typeof config.public !== "boolean") return;
		let preview = false;
		try { preview = localStorage.getItem("gorbach-preview") === "1"; } catch {}
		function updateVisibility() {
			if (location.hash === "#gzbot" || location.hash === "#gzbot-off") {
				preview = location.hash === "#gzbot";
				try {
					if (preview) localStorage.setItem("gorbach-preview", "1");
					else localStorage.removeItem("gorbach-preview");
				} catch {}
			}
			widget.hidden = !config.enabled || (!config.public && !preview);
		}
		updateVisibility();
		window.addEventListener("hashchange", updateVisibility);
	}).catch(() => {});
}
