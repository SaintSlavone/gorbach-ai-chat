# Gorbach chat widget

Launch the local demo with Python 3.9 or newer.

```sh
python server.py
```

Open [the local demo](http://127.0.0.1:8791/). Its replies are sample text. The `gorbach-stand-admin` service handles live knowledge-base answers.

Serve `public/widget/gorbach.js` at `/widget/gorbach.js` and add this before the closing `</body>` tag.

```html
<script src="/widget/gorbach.js" data-api="/api/cbot/" defer></script>
```

The API should be proxied on the same origin unless the backend explicitly allows the website origin. `GET /api/cbot/status` controls launcher visibility. `POST /api/cbot/msg` receives `{text, history}` and returns `{ok, reply}`. Each history entry has a `role` of `user` or `assistant` and a `text` string. The widget keeps up to 12 recent messages in memory.

The host page’s HTML `lang` controls the widget copy. Supported languages are Czech, German, English, Russian and Ukrainian. Optional `data-greet` and `data-neterr` on the script override the greeting and network error text.

The stand embeds the same script with `data-api="/api"`. This mode uses the stand's session, quote and service questionnaires, attachment uploads, contact review, and lead submission. It restores the conversation from the saved session id after reload and uses the language returned by the stand for its controls.
