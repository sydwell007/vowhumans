# Migration order

1. `001_adapter_schema.sql`
2. `002_seed_reference_data.sql`
3. `003_commercial_expansion.sql` — additive customer portal, billing, marketplace, partners, Academy, analytics and governance tables

4. `004_digital_workforce.sql` — additive Digital Colleague configuration, work, approval, deployment and evidence tables
5. `005_digital_workforce_seed_templates.sql` — idempotent 25-role governed starter catalogue
6. `006_post_deployment_runtime.sql` — operator pointer; canonical runtime migration remains PostgreSQL migration 019
7. `007_photoreal_replicas.sql` — additive consent, capture-reference, processing, version, quality and assignment tables (never raw media)

Do not import the PostgreSQL migrations into Afrihost MySQL. Do not expose this folder through a public web route; the PHP `.htaccess` blocks SQL/config artefacts but uploads should remain outside the API document root when possible.
