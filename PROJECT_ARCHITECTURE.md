# Project architecture

The Gorbach widget uses plain JavaScript, CSS, and HTML. The bundled widget is a single
checked-in script with styles scoped to a Shadow DOM. No build step is needed.

- `public/widget/gorbach.js` is the embeddable widget.
- `demo.html` and `server.py` provide a local UI demo using the Python standard library.
- The stand backend supplies the live chat API and Gemini integration.
- `tests/` covers the widget contract and the local demo HTTP routes.

The browser sends only the latest question and up to 12 recent messages with each
request. The transcript lives in memory until reset or page unload. The widget uses
the host page language for its controls, and displays visitor and assistant messages
as plain text.
