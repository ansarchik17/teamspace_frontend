# Corporate login on the sign-in page

The company account button is hidden until `GET /api/v1/auth/login-options?organization=<slug>` returns `corporate_login: true`. The same rule applies to its separator. Password login and internal Keycloak session SSO continue to work independently.

A company login link (`/web/login?organization=<slug>`, including a redirect from a tenant host) identifies the company. On the generic login page, entering a managed address such as `user@company.teamspace.kz` also identifies it. IIN, personal addresses and external domains do not reveal company membership; users with these logins use the company login link.

The public response contains only a boolean, no provider details or user lookup. Missing, disabled, error-state or suspended company configurations hide the button. Pending/failed checks hide it as well, and obsolete responses are aborted/ignored when the company changes. The corporate redirect includes the checked company slug and the existing backend rechecks its provider at click time. A company-specific login never falls back to a generic Keycloak login when its resolver is unavailable.
