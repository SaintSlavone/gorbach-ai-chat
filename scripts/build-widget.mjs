import { mkdir, readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
import { compile } from "sass";

const directory = "src/components/chat-widget";
const styles = compile(directory + "/ChatWidget.scss", { style: "compressed" });
const source = await readFile(directory + "/ChatWidget.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2020 },
});
await mkdir("public/widget", { recursive: true });
await writeFile("public/widget/gorbach.js",
	`(() => {\n"use strict";\nconst WIDGET_CSS = ${JSON.stringify(styles.css)};\n${outputText}\n})();\n`
);
