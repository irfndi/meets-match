## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2026-04-08 - Authorization Bypass in Match Profile Viewing (IDOR)
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `matchesCallbacks` allowed any user to view any other user's profile by manipulating the `view_match_user_<targetUserId>` callback data.
**Learning:** Relying solely on hard-to-guess UUIDs or unverified UI flows is insufficient. Any endpoint returning sensitive data must explicitly verify the caller's authorization to access that specific data.
**Prevention:** Always verify object ownership or authorization relationship (e.g., ensuring users are actually matched via `matchService.getMatchList`) before returning sensitive profile data.
