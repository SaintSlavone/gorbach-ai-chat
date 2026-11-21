import type { ReactNode } from "react";
import "../styles/style.scss";

export default function RootLayout({ children }: { children: ReactNode }) {
	return <html lang="cs"><body>{children}</body></html>;
}
