# Design notes

The plugin reads the session's durable event snapshot before the report's sequence number. Human-authored messages seed a known-word set; assistant text can add nearby glosses. This is a heuristic approximation: seeing or using a term does not prove the reader understands it.

At `agent/turn-stopping`, the plugin checks the last assistant text in that exact top-level turn. Advisory mode records the result in the Agent's in-memory state and logs a short summary. `/report` displays that result; if there is none in the current process, it checks the last assistant text on demand. State is not persisted across Agent recreation or server restart. Configuration is resolved from the session's current working directory, including recorded directory changes.

In enforce mode, an unsuccessful result steers a bounded rewrite, with a fresh budget per Agent and turn. The original response has already been streamed and committed at this point. Neither advisory nor enforce prevents its publication; a pre-publication gate would require a separate buffering and delivery design. A reached retry limit is reported through `/report`.

The engine uses configurable rule packs and accepts some false positives and negatives. It makes no semantic-understanding claim. Tier-3 is only a frequency heuristic, and the semantic model option is not implemented. Automatic failures are fail-open to avoid breaking user work; errors are logged and made available to `/report` while the Agent remains alive.
