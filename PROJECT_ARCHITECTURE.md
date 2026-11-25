# Project architecture

The Gorbach widget uses plain JavaScript, CSS, and HTML. The bundled widget is a single
checked-in script with styles scoped to a Shadow DOM. No build step is needed.

- `public/widget/gorbach.js` is the embeddable widget.
- `demo.html` and `server.py` provide a local UI demo using the Python standard library.
- The stand backend supplies the live chat API and Gemini integration.
- `tests/` covers the widget contract and the local demo HTTP routes.

The `/api/cbot/` mode sends the latest question and up to 12 recent messages. This
transcript lives in memory until reset or page unload. The `/api/` mode restores the
stand's session and renders its questionnaire, attachments, lead review, and receipt.
The widget displays visitor and assistant messages as plain text. The controls use the
page language unless the stand supplies a conversation language.
