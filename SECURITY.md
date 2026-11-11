# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately:

- through GitHub: **Security → Report a vulnerability** on
  [haustex/cm-medusa-blog-seo](https://github.com/haustex/cm-medusa-blog-seo/security), or
- by e-mail to [dev@hauskayu.com](mailto:dev@hauskayu.com), subject "Security: medusa-blog-seo".

Include the plugin and Medusa versions, what an attacker can do, and steps to reproduce. We will confirm that we
received the report, keep you updated while we fix it, and credit you in the release notes if you wish.

## Scope

Of particular interest:

- creating a review for an order you did not place (verified purchase), or more than one per purchased item;
- reading a reviewer's e-mail, customer id, order id or IP hash through the Store API;
- a public URL for a photo of a review that is not approved;
- forging or reusing a magic-link token or an unsubscribe link;
- listing non-approved reviews, or another customer's wishlist, without an Admin login.

## Operating the plugin safely

- Keep `auto_approve` off unless you moderate afterwards; Google's review guidelines expect genuine, moderated reviews.
- Run Redis (Cache Module) in production so the rate limit is shared by every server process.
- The plugin never imports or generates reviews; a future importer will label the source of every review.
