# WhatsApp Routing Review

## The Architectural Challenge
WhatsApp provisions a single conversation thread per business number, while Simpulx supports multiple campaigns and multiple lead instances per contact. This is the highest-risk area for data leakage and context contamination.

## Current Routing Logic
1. **Referral Source:** Identifies campaign via CTWA ad data.
2. **Keyword Match:** Identifies campaign via text payload.
3. **Fallback:** If neither matches, it routes to the *latest active lead instance* or prompts unassigned users.

## Production Risks

1. **The Zombie Context Bleed:**
   - Scenario: A customer interacts with Campaign A (Honda) on Monday. The thread remains "active".
   - On Friday, they see a billboard for Campaign B (Toyota) and type "Halo, mau tanya mobil" (no keyword).
   - Bug: The system routes this to Campaign A because it's the "latest active lead instance." Agent A is confused, Agent B never gets the lead.
   - **Mitigation:** Implement an aggressive **Inactivity TTL (Time-To-Live)**. If a conversation has no activity for 24-48 hours, it should be marked 'stale'. Ambiguous messages on stale threads should trigger the unassigned bot prompt, NOT route to the old thread.

2. **The Prompt Trap:**
   - A brand new contact says "Hi". They are sent the bot prompt: *"Halo! Boleh tahu mobil apa...?"*
   - They reply with "Saya mau kredit" (still no keyword).
   - Bug: The `created` flag is only true once. The system will NOT re-prompt. The lead sits unassigned forever.
   - **Mitigation:** The unassigned queue must be actively monitored by humans, OR the bot needs a limited fallback loop (e.g., max 2 prompts before routing to a default triage agent).

3. **Keyword Collisions:**
   - Campaign A keyword: "Promo"
   - Campaign B keyword: "Promo Akhir Tahun"
   - Bug: "Promo Akhir Tahun" might match Campaign A if a simple `strings.Contains` is used carelessly.
   - **Mitigation:** Ensure strict boundary matching or prioritization of longer/exact keyword matches first.

## Conclusion
The resolution order (Referral -> Keyword -> Last Active) is the correct architectural pattern. However, without a strict TTL on "Last Active", cross-campaign contamination is inevitable at scale. Fix the TTL.
