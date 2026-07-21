# Aurora — UI + viral features

Patches applied on the live Aurora messenger at `135.106.173.99` (`/opt/aurora`).

## Latest
- **Fix «Показать меня» on Nearby map**: root cause was `Permissions-Policy: geolocation=()` which blocked all geo; now `geolocation=(self)`. Clear geo error messages + coarse-location retry.
- Chat location attach: same geo retry / clear errors
- Browser smoke: Nearby go-live OK, voice mic recording OK, private call overlay «Звоним...» OK
