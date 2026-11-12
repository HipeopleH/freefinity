# Freefinity

Freefinity is an OpenAI-compatible gateway for provider API credentials that the account owner is authorized to use.

## Stack

- Vercel serverless functions
- Supabase Auth
- Supabase Postgres
- AES-256-GCM encryption for stored provider credentials

## Deploy

1. Connect this repository to Vercel.
2. Set the server environment variables listed below.
3. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor.
4. Deploy the `backend-foundation` branch to a Vercel Preview deployment and test it before merging.

## Required Vercel environment variables

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Server only; never expose it to browser code.
- `CREDENTIAL_ENCRYPTION_KEY`: base64-encoded 32-byte random key. Server only.

Do not use a `NEXT_PUBLIC_` prefix for any secret. Keep all four variables server-side.

Generate an encryption key locally with Node.js:

```js
console.log(require('node:crypto').randomBytes(32).toString('base64'));
```

## Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|POST /api/credentials`
- `DELETE /api/credentials/:id`
- `GET|POST /api/gateway-keys`
- `GET /v1/models`
- `POST /v1/chat/completions`

The initial gateway adapters support OpenAI, OpenRouter, DeepSeek, and Mistral using their OpenAI-compatible chat-completions APIs. Other providers need dedicated adapters before they can be used.

## Security notes

- Provider keys are encrypted at rest with AES-256-GCM.
- Gateway keys are stored as SHA-256 hashes and shown only when created.
- Supabase service-role access is restricted to server functions.
- Every credential query is scoped to the authenticated account.
- Add rate limits, usage quotas, audit logging, and abuse monitoring before public launch.