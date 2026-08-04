# Migration order

1. `001_adapter_schema.sql`
2. `002_seed_reference_data.sql`

Do not import the PostgreSQL migrations into Afrihost MySQL. Do not expose this folder through a public web route; the PHP `.htaccess` blocks SQL/config artefacts but uploads should remain outside the API document root when possible.

