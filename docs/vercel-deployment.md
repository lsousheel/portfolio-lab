# Deploying Portfolio Lab to Vercel

The app has a Vercel Express entry point in src/index.ts. Local npm start still uses src/server.ts. The public directory provides the frontend; data/nasdaq is bundled for historical analysis.

A hosted MySQL 8 database is required. The local database on 127.0.0.1:3307 cannot be used by Vercel. Do not expose the laptop database to the internet.

Configure these values in the Vercel project environment settings before deployment:

- DB_HOST, DB_PORT (provider port), DB_NAME, DB_USER, DB_PASSWORD: hosted MySQL connection settings.
- DB_SSL=true. If the provider uses its own certificate authority, supply its PEM certificate as DB_SSL_CA. Certificate verification remains enabled.
- MARKET_PROVIDER=csv.
- EXECUTION_MODE=demo-last-quote for labeled virtual demonstrations, or strict for five-minute quote validation.
- FINNHUB_API_KEY: server-side quote/news key.
- ADMIN_TOKEN: omit to disable the global admin basket endpoint, or use a new random secret. Never reuse the local example token.

Apply migrations once against the hosted database using a local shell configured with those hosted DB variables: npm run build, then npm run migrate. Do not run migrations during request handling. CSV history loads through analysis; importing real local user records is a separate decision. New cloud accounts start independently of the local database.

Deployment: npx vercel --prod. Verify the public home page, /app-config, and account creation, portfolio funding, analysis, and a virtual order before calling the deployment complete. Do not claim live functionality based only on the static home page or /health.

This remains an academic simulator. Accounts use browser-held demo tokens. API caches and rate budgets are per function instance, so provider limits must also be monitored at the provider account level. Long analyses may exceed function duration limits; validate with the cloud database and actual deployment. Hosted MySQL TLS connectivity and Vercel execution have not yet been verified.

Reference: https://vercel.com/docs/frameworks/backend/express
