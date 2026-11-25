import json
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from threading import Thread
import unittest

from server import DemoHandler


class DemoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), DemoHandler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()
        cls.server.server_close()

    def request(self, method, path, body=None):
        conn = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            payload = None if body is None else json.dumps(body)
            conn.request(method, path, payload)
            reply = conn.getresponse()
            return reply.status, reply.read()
        finally:
            conn.close()

    def test_demo_assets_and_status(self):
        status, page = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b'/widget/gorbach.js', page)
        self.assertEqual(self.request("GET", "/widget/gorbach.js")[0], 200)
        status, data = self.request("GET", "/api/cbot/status")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data), {"ok": True, "enabled": True})
        self.assertEqual(self.request("GET", "/server.py")[0], 404)

    def test_message_contract_and_validation(self):
        endpoint = "/api/cbot/msg"
        question = {"text": "Stínění?", "history": []}
        status, first = self.request("POST", endpoint, question)
        self.assertEqual(status, 200)
        answer = json.loads(first)
        self.assertTrue(answer["ok"])
        self.assertTrue(answer["reply"])
        question["history"] = [{"role": "assistant", "text": answer["reply"]}]
        self.assertNotEqual(self.request("POST", endpoint, question)[1], first)
        self.assertEqual(self.request("POST", endpoint, {"text": " "})[0], 400)
        self.assertEqual(self.request("POST", endpoint, {"text": "x", "history": [[]]})[0], 400)
