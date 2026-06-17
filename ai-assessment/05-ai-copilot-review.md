# AI Copilot Review

## Current AI Direction
The system currently performs:
1. **Rules Classifier:** Interest level, stage mapping (Free, Instant).
2. **Field Extractor:** LLM extracts structured data (`car_brand`, `city`, etc.).
3. **Follow-Up Generator:** Cron job drafting 4h follow-ups.
4. **No Auto-Reply:** Explicitly disabled to protect brand reputation.

## Missing Components & Scalability Risks
1. **Real-time Value is Missing:** While extraction is nice, it doesn't help the agent close the sale faster *during* the chat. The 4h follow-up is asynchronous. 
2. **Cron Job Bottleneck:** The follow-up generator runs on a gateway cron. At 100,000 active conversations, scanning the database for threads needing a 4h follow-up and sequentially calling the LLM will timeout or block the gateway.
3. **RAG Embedding Quality:** Default is "local hashing" which is useless for semantic matching.

## What Should NOT Be Built
- **Full Auto-Reply Bots:** Do not reintroduce them. Car sales require human nuance.
- **Complex Multi-Agent Frameworks:** Unnecessary. A single LLM call for extraction/drafting is sufficient.

## Proposed Enterprise AI Roadmap (High ROI)

1. **Agent Assist (Suggested Replies):** 
   - *What:* When a customer asks a question, use RAG (with OpenAI embeddings) to fetch the KB answer and display 3 suggested replies in the agent's UI.
   - *Why:* Drastically reduces Average Handling Time (AHT) and ensures consistent answers.
2. **Conversation Summarization for Handoff:**
   - *What:* When transferring a lead from Agent to Supervisor, generate a 3-bullet summary of the thread.
   - *Why:* Prevents the customer from having to repeat themselves.
3. **Extract to CRM Sync:**
   - *What:* The current field extraction should map directly to UI forms so the agent can one-click save it, rather than typing it manually.
4. **Decouple the Cron:**
   - *What:* Move the 4h follow-up generator to an asynchronous worker queue (NATS JetStream or Redis/Asynq) instead of the gateway cron.

## Summary
The restraint shown by removing the auto-reply is commendable. Focus AI efforts strictly on **Agent Augmentation** (making the human faster) rather than **Agent Replacement**.
