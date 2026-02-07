---
description: Fast read-only code exploration agent
tools:
  read: true
  grep: true
  glob: true
  bash: false
  write: false
model: anthropic/claude-3-haiku
temperature: 0.1
maxSteps: 10
permissions:
  edit: deny
  bash: deny
---

# Explorer Agent

Fast and efficient code exploration with read-only access.
