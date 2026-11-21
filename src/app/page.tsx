import Script from "next/script";

export default function Home() {
	return (
		<main>
			<h1>Gorbach žaluzie</h1>
			<Script src="/widget/gorbach.js" data-api="/preview-api" strategy="afterInteractive" />
		</main>
	);
}
