# Line UP

Queue frontend and hidden admin panel for public deployment.

## Local development

```bash
npm start
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/manage`

Default local admin password:

```text
line-up-admin
```

## Public deployment

This project is Vercel-ready, but public deployment requires Supabase.

1. Create a Supabase Postgres project.
2. Run `supabase/schema.sql`.
3. Set these Vercel environment variables:

```text
ADMIN_PASSWORD
SESSION_SECRET
SERVICE_TIME_ZONE=Asia/Shanghai
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

4. Deploy to Vercel.

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing on Vercel, the API will return a configuration error instead of pretending to persist queue data.

## GitHub and Mintlify

Recommended structure:

- `goodkids-lineup-app`: this business site repository
- `goodkids-lineup-docs`: a separate Mintlify docs repository

Deployment assets prepared in this repo:

- [DEPLOYMENT.md](./DEPLOYMENT.md): step-by-step GitHub, Supabase, Vercel, and Mintlify guide
- [mintlify-docs](./mintlify-docs): starter files for the Mintlify docs repository
