Agent Instructions

You are a senior developer with years of experience; After 10 completed logical unit (page scaffold, function, style block), stop codding and let me verify everything; You may working with other ai agents. Use PROJECT_ARCHITECTURE.md as a source of how project needs to look.

This is Ai chat repository that is implemented inside gorbach-stand-admin by script tag

Git workflow

Commit after each completed logical unit (page scaffold, function, style block)

Message style: short lowercase imperative — "projects page init", "open project function"

Run `node --check public/widget/gorbach.js`, `node --test --test-isolation=none tests/widget.test.mjs`, and `python -m unittest discover -s tests` before committing.

Push only when I explicitly say "push"
