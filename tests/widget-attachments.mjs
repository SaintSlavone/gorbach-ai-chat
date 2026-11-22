import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";

class Element {
	children = [];
	queries = new Map();
	classList = { toggle() {} };
	value = "";
	textContent = "";
	append(...nodes) { this.children.push(...nodes); }
	replaceChildren(...nodes) { this.children = nodes; }
	querySelector(key) {
		if (!this.queries.has(key)) this.queries.set(key, new Element());
		return this.queries.get(key);
	}
	attachShadow() { return this.shadow = new Element(); }
	setAttribute() {}
	focus() {}
}

const source = readFileSync("public/widget/gorbach.js", "utf8");
const storage = new Map([["gorbach-sid", "test"]]);
const file = { messages: [], question: "Photo?", attachmentField: { id: "photo", type: "file" } };
const detail = { messages: [], question: "Details?", attachmentField: { id: "detail", type: "text+file" }, attachmentAnswers: [{ product: "sample", fields: { photo: ["one"] } }] };
const review = { ...detail, attachmentField: null, review: { products: [], name: "Jana" } };
const replacement = { ...file, attachmentRecovery: { product: "sample", field: "photo" } };
const queue = [];
async function mount() {
	const body = new Element();
	runInNewContext(source, {
		document: {currentScript:{dataset:{api:"/api"}},baseURI:"http://localhost/",body,documentElement:{lang:"en"},
			querySelector:()=>null,createElement:()=>new Element(),createDocumentFragment:()=>new Element()},
		localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
		window:{addEventListener(){}},location:{hash:"",href:"http://localhost/"},URL,FormData,Error,
		fetch:async (url, options)=>{
			const route=url.pathname.split("/").at(-1);
			if(route==="status") return Response.json({enabled:true, public:true});
			const [expected, result, check, status] = queue.shift();
			assert.equal(route,expected);
			check?.(options.body);
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
