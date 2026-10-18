# Development log (actual session record)

2026-10-18: Initiating user message: "use this as refernece do a good job". User clarification: "use the promt i pasted". Full reference preserved in reference-request.txt. Assignment preserved as assignment.pdf. No lecture slides supplied.

Design baseline: seven-page conceptual report produced before backend code. All seven rendered pages inspected. Source references checked through browsing. No names fabricated.

Issue 1: PDF extraction raised UnicodeEncodeError under cp1252 for a bullet. Actual tool change: set PYTHONIOENCODING=utf-8 before rerunning pypdf extraction. All four pages then read. This was an agent-directed fix, not a new human prompt.

Environment: Node 22.19 available. MySQL Workbench client exists but no server/service found; Docker unavailable. Downloading official MySQL 8.4.11 portable ZIP into ignored .local for isolated database validation. Initial guessed 8.4.7 URL returned 404; official download page identified 8.4.11.

AI activity: requirements interpretation, design/report drafting, source checking, implementation and test generation by Codex in this chat. Tests are not independent human validation. Expected-value examples and invariants will be documented separately. No later instructor hints received.
