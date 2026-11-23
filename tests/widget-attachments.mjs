import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";

class Element {
	children = [];
	queries = new Map();
	attributes = new Map();
	classList = { toggle() {} };
	value = "";
	textContent = "";
	append(...nodes) {
		for (const node of nodes) node.parent = this;
		this.children.push(...nodes);
	}
	replaceChildren(...nodes) { this.children = nodes; }
	querySelector(key) {
		if (!this.queries.has(key)) this.queries.set(key, new Element());
		return this.queries.get(key);
	}
	attachShadow() { return this.shadow = new Element(); }
	setAttribute(name, value) { this.attributes.set(name, value); }
	focus() { this.focused = true; }
	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
	}
}

const source = readFileSync("public/widget/gorbach.js", "utf8");
const storage = new Map([["gorbach-sid", "test"]]);
const file = { messages: [], question: "Photo?", attachmentField: { id: "photo", type: "file" } };
const detail = { messages: [], question: "Details?", attachmentField: { id: "detail", type: "text+file" }, attachmentAnswers: [{ product: "sample", fields: { photo: ["one"] } }] };
const review = { ...detail, attachmentField: null, review: { products: [], name: "Jana" } };
const replacement = { ...file, attachmentRecovery: { product: "sample", field: "photo" } };
const queue = [];
async function mount(lang = "en") {
	const body = new Element();
	runInNewContext(source, {
		document: {currentScript:{dataset:{api:"/api"}},baseURI:"http://localhost/",body,documentElement:{lang},
			querySelector:()=>null,createElement:()=>new Element(),createDocumentFragment:()=>new Element()},
		localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
		window:{addEventListener(){}},location:{hash:"",href:"http://localhost/"},URL,FormData,Error,
		fetch:async (url, options)=>{
			const route=url.pathname.split("/").at(-1);
			if(route==="status") return Response.json({enabled:true, public:true});
			const [expected, result, check, status] = queue.shift();
			assert.equal(route,expected);
			check?.(options.body, url);
			return Response.json(result, {status:status ?? 200});
		},
	});
	await setImmediate();
	const widget=body.children[0].shadow.children[1];
	widget.querySelector(".launcher").onclick();
	await setImmediate();
	return widget;
}
const payload = expected => body => assert.deepEqual(JSON.parse(body), {sid:"test", ...expected});
function pick(widget) {
	const picker=widget.querySelector("fieldset").children.find(node=>node.type==="file");
	picker.files=[new File(["fixture"],"fixture.pdf")];
	picker.onchange();
	return setImmediate();
}
function click(widget,label) {
	widget.querySelector("fieldset").children.find(node=>node.textContent===label).onclick();
	return setImmediate();
}
const checkUpload=body=>{
	assert.equal(body.get("sid"),"test");
	assert.equal(body.get("file").name,"fixture.pdf");
};
queue.push(["history",file],["file",{error:"type"},checkUpload,400],["file",{file:{id:"one",name:"fixture.pdf"}},checkUpload],["msg",detail,payload({files:["one"]})]);
let widget=await mount();
await pick(widget);
assert.equal(widget.querySelector(".error").textContent,"Unsupported file type.");
await pick(widget);
await click(widget,"Confirm attachments");

queue.push(["history",detail],["file",{file:{id:"two",name:"detail.pdf"}},checkUpload],["msg",{error:"invalid_attachment"},payload({text:"description",files:["two"]}),400],["msg",review,payload({text:"description",files:["two"]})]);
widget=await mount();
assert.ok(widget.querySelector("fieldset").children.some(node=>node.textContent.includes("fixture.pdf")));
await pick(widget);
const input=widget.querySelector("input");
input.value="description";
const send=async()=>{widget.querySelector("form").onsubmit({preventDefault(){}});await setImmediate();};
await send();
assert.equal(input.value,"description");
assert.equal(widget.querySelector(".error").textContent,"Select a valid attachment.");
await send();

queue.push(["submit",{error:"incomplete"},payload({}),400],["history",replacement],["file",{file:{id:"three",name:"replacement.pdf"}},checkUpload],["msg",review,payload({files:["three"]})],["submit",{lead_id:"GZ-1"},payload({})]);
await click(widget,"Submit enquiry");
assert.ok(widget.querySelector("fieldset").children.some(node=>node.textContent==="Replace the expired attachment."));
await pick(widget);
await click(widget,"Confirm attachments");
await click(widget,"Submit enquiry");
assert.equal(widget.querySelector("fieldset").children[0].textContent,"Enquiry number: GZ-1");
assert.equal(widget.querySelector("form").hidden,true);
assert.equal(queue.length,0);

const suggestions = [
	{ id: "products", label: "Explore shading" },
	{ id: "quote", label: "Request a quote" },
	{ id: "handoff", label: "Ask a specialist" },
];
const handoffReview = {
	lang: "ru",
	messages: [],
	review: { purpose: "handoff", products: [], name: "Jana", email: "jana@example.com" },
};
queue.push(
	["history", { messages: [], chips: suggestions }],
	["msg", { lang: "ru", messages: [], input: "text", question: "Как вас зовут?" }, payload({ chip: "handoff" })],
	["msg", { lang: "ru", messages: [], input: "phone" }, payload({ text: "Jana" })],
	["msg", { error: "invalid_contact" }, payload({ text: "неверный" }), 400],
	["msg", handoffReview, payload({ text: "jana@example.com" })],
	["history", handoffReview],
	["submit", { lead_id: "GZ-2" }, payload({})],
	["history", { lang: "ru", messages: [], lead_id: "GZ-2" }],
	["reset", { sid: "fresh" }, payload({})],
	["history", { lang: "uk", messages: [] }, (_body, url) => assert.equal(url.searchParams.get("sid"), "fresh")],
);
widget = await mount("cs-CZ");
assert.match(widget.querySelector("p").textContent, /AI asistent Gorbach žaluzie/);
assert.equal(widget.lang, "cs");
assert.deepEqual(widget.querySelector("fieldset").children.map(node => node.textContent),
	suggestions.map(({ label }) => label));
await click(widget, "Ask a specialist");
const contactInput = widget.querySelector("input");
assert.equal(contactInput.focused, true);
assert.equal(widget.lang, "ru");
assert.equal(widget.querySelector(".launcher").attributes.get("aria-label"), "Открыть чат");
assert.equal(widget.querySelector(".close").attributes.get("aria-label"), "Закрыть чат");
assert.equal(widget.querySelector(".reset").textContent, "Новый разговор");
assert.equal(widget.querySelector("form").querySelector("button").textContent, "Отправить");

async function sendContact(text) {
	widget.querySelector("input").value = text;
	widget.querySelector("form").onsubmit({ preventDefault() {} });
	const waiting = widget.querySelector(".messages").children.find(node => node.className === "waiting");
	assert.equal(waiting.attributes.get("aria-label"), "Ожидаю ответа…");
	await setImmediate();
}
await sendContact("Jana");
assert.equal(contactInput.placeholder, "Телефон или эл. почта");
assert.equal(contactInput.attributes.get("aria-label"), contactInput.placeholder);
await sendContact("неверный");
assert.match(widget.querySelector(".error").textContent, /действительный номер/);
await sendContact("jana@example.com");
assert.equal(widget.querySelector(".error").textContent, "");
assert.equal(widget.querySelector("form").hidden, true);
widget = await mount("uk");
assert.match(widget.querySelector("p").textContent, /ШІ-асистент Gorbach žaluzie/);
assert.equal(widget.lang, "ru");
assert.equal(widget.querySelector("form").hidden, true);
assert.equal(widget.querySelector("fieldset").children[0].textContent, "Jana · jana@example.com");
await click(widget, "Передать специалисту");
assert.equal(widget.querySelector("fieldset").children[0].textContent, "Номер заявки: GZ-2");
widget = await mount("cs");
assert.equal(widget.lang, "ru");
assert.equal(widget.querySelector("fieldset").children[0].textContent, "Номер заявки: GZ-2");
assert.equal(widget.querySelector("form").hidden, true);
widget.querySelector(".reset").onclick();
await setImmediate();
assert.equal(widget.lang, "uk");
assert.equal(widget.querySelector(".reset").textContent, "Нова розмова");
assert.equal(widget.querySelector("form").hidden, false);

storage.delete("gorbach-sid");
queue.push(["start", { sid: "fresh", lang: "constructor", messages: [] }, body => {
	assert.deepEqual(JSON.parse(body), { lang: "de", page: "http://localhost/" });
}]);
widget = await mount("de-DE");
assert.equal(widget.lang, "de");
assert.equal(widget.querySelector("input").placeholder, "Nachricht");
assert.equal(queue.length, 0);
