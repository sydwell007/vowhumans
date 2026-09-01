# Afrihost Shared Hosting private replica storage

This package can store authorised Photoreal Replica captures on the current
Afrihost Shared Hosting account. Afrihost is used as a private encrypted file
store, not as an S3-compatible service and not as a GPU processor.

## Storage boundary

- Public PHP endpoint: `https://api.vowhumans.com/api/v1/replica-storage/`
- Private data root: `/home/vowhumg0z5c9/vowhumans-private`
- Public web files remain in the API subdomain's document root.
- Raw replica data is never written under `public_html`.
- Each 2 MB upload part is encrypted at rest with AES-256-GCM before PHP writes
  it to disk. A final SHA-256 check covers the complete plaintext video.
- Vercel signs every server-to-server operation. The gateway rejects expired,
  changed, unsigned, and replayed requests.

## cPanel deployment

1. In **MultiPHP Manager**, set the API subdomain to PHP 8.2 or newer.
2. In **Select PHP Version**, confirm the `openssl` extension is enabled.
3. Upload the updated `public/php` contents to the existing API subdomain
   document root.
4. Create `/home/vowhumg0z5c9/vowhumans-private` in cPanel File Manager, outside
   `public_html`, with owner-only permissions where cPanel permits them.
5. Keep the live configuration outside the web root, for example
   `/home/vowhumg0z5c9/vowhumans-config/config.php`, and make
   `VOWHUMANS_CONFIG_FILE` point to it. If the account cannot set an environment
   variable, the existing protected `config.php` fallback works, but the
   external file is preferred.
6. Add the `private_storage` block from `config.example.php` to that live
   configuration. Generate two different credentials:

   ```sh
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
   php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
   ```

   Use the first output as `secret` and the second as `encryption_key`. Never
   paste either value into source control or support messages.
7. Keep `max_chunk_bytes` at `3145728`. The application sends 2 MB chunks, so
   the PHP `post_max_size` and the hosting request-body limit must allow at
   least 3 MB. A value of 8 MB leaves safe overhead.
8. Confirm that opening the endpoint without a valid signed request returns
   `401` or `404`, never a directory listing or stored media.

## Vercel production variables

Add these only after the PHP endpoint and external directory are ready:

```text
PRIVATE_STORAGE_PROVIDER=afrihost
AFRIHOST_PRIVATE_STORAGE_URL=https://api.vowhumans.com/api/v1/replica-storage/
AFRIHOST_PRIVATE_STORAGE_SECRET=<same value as private_storage.secret>
```

Redeploy the existing VowHumans Vercel project after saving the variables. Do
not import a second Vercel project. The old `S3_*` values may remain during a
rollback window, but they are ignored while the provider is `afrihost`.

## Operational limits

Shared Hosting is suitable for the first controlled replica captures, but it
has finite disk, inode, CPU and request-time limits. Monitor account usage and
define consent-aligned deletion/retention before customer rollout. Move the
same adapter contract to managed object storage or an Afrihost Cloud Server
before high-volume production; GPU training and realtime rendering must remain
on the dedicated worker infrastructure.
