import Script from "next/script";

export default function Home() {
	return (
		<main>
			<h1>Gorbach žaluzie</h1>
			<Script
				src="/widget/gorbach.js"
				data-api={process.env.GORBACH_CHAT_API || "/preview-api"}
				strategy="afterInteractive"
			/>
		</main>
	);
}
