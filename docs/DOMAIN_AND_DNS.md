# Domain and DNS (trackcongress.org)

Repo-side domain config lives in both `wrangler.toml` files (`ALLOWED_ORIGIN`,
Custom Domain routes for apex + www). Two items **cannot** be expressed in this
repo and must be set in the Cloudflare dashboard for the `trackcongress.org`
zone.

## 1. www → apex redirect

Workers Static Assets `_redirects` does **not** support domain-level
(host-based) redirects. Create a Single Redirect rule:

1. Cloudflare Dashboard → zone **trackcongress.org** → **Rules** → **Redirect Rules**
2. Create rule, for example name: `www to apex`
3. **If** incoming request matches:
   - Hostname equals `www.trackcongress.org`
4. **Then** Dynamic redirect:
   - Status code: `301`
   - Target expression: `concat("https://trackcongress.org", http.request.uri.path)`
   - Preserve query string: on

After this ships, keep both Custom Domains on the Worker (`trackcongress.org`
and `www.trackcongress.org` in `wrangler.toml`) so the redirect target is still
served by the same Worker.

## 2. Email spoofing protection (SPF + DMARC + CAA)

This domain does **not** send mail. Publish null SPF/DMARC so forgeries that
claim `@trackcongress.org` fail authentication. Also pin certificate issuance.

In **DNS** → **Records** for `trackcongress.org`, add:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| `TXT` | `@` | `v=spf1 -all` | DNS only |
| `TXT` | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s` | DNS only |
| `CAA` | `@` | `0 issue "letsencrypt.org"` | DNS only |
| `CAA` | `@` | `0 issue "pki.goog"` | DNS only |

Notes:

- Do **not** add MX records unless you later configure real mail.
- Optional: append `; rua=mailto:you@example.com` to the DMARC value if you want
  aggregate reports (requires a mailbox you control).
- Cloudflare Universal SSL / Workers custom domains typically use DigiCert /
  Google / Let's Encrypt; `letsencrypt.org` and `pki.goog` cover common paths.
  If certificate issuance fails after adding CAA, check the zone SSL/TLS logs
  and adjust issuers to match Cloudflare's active CA for the zone.

## Related

- Production CORS allowlist: `ALLOWED_ORIGIN` in `wrangler.toml`
- Static security headers: `web/public/_headers` (values locked to `shared/security-headers.ts`)
- Worker JSON security headers: `workers/senate_data_worker/src/http/responses.ts` (imports `shared/security-headers.ts`)
- Crawler policy: `web/public/robots.txt`
