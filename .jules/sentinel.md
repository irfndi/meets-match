## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2026-04-22 - Outdated Dependencies with CVEs in Fiber and gRPC
**Vulnerability:** Denial of Service via Route Parameter Overflow in Fiber (GO-2026-4543) and Authorization bypass in gRPC-Go via missing leading slash in :path (GO-2026-4762).
**Learning:** Outdated dependencies can expose applications to known vulnerabilities. Regular scans with `govulncheck` are essential to identify and mitigate these risks.
**Prevention:** Regularly run `govulncheck ./...` in Go projects to detect and update packages with known vulnerabilities.

## 2024-05-24 - Markdown Injection in Telegram Messages
**Vulnerability:** Telegram's legacy Markdown parser (`parse_mode: 'Markdown'`) crashes if special characters like `_`, `*`, `[`, `]`, `` ` ``, and `\` are not escaped in dynamically inserted content, potentially leading to denial of service or formatting manipulation.
**Learning:** All user-provided text embedded within Markdown messages must be explicitly escaped.
**Prevention:** Use the `escapeMarkdown` utility function on any user-generated data (e.g., names, bios, locations) before interpolating it into a message with `parse_mode: 'Markdown'`.
