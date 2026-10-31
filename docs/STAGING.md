> تحديث 1 نوفمبر 2026: هدف النشر المعتمد أصبح AWS EC2 + RDS PostgreSQL + S3 عبر IAM Role. تعليمات Oracle/Neon أدناه مرجع سابق؛ استخدم [دليل AWS](AWS_DEPLOYMENT_AR.md) للنشر الحالي.

> تحديث 31 أكتوبر 2026: تأكيد البريد واستعادة الباسورد أصبحا عبر OTP؛ إعدادات RESET_LINK_BASE وVERIFY_LINK_BASE وخطوات deep links الخاصة بهما أدناه لم تعد مطلوبة. راجع [دليل OTP وOAuth](OTP_OAUTH_SETUP_AR.md).

# Free staging preparation — verified 2026-10-30

**Approved update 2026-10-31:** use a public server IP without buying a domain. DNS/hostname instructions below are an optional alternative. Publicly trusted IP TLS issuance/renewal must be configured and tested before live mobile access; the default Caddyfile alone is not evidence of that integration. Age is strictly greater than 18 and current weight/height are profile values without measurement dates/history. See [latest decisions](PRODUCT_DECISIONS_AR.md).

No staging service, cloud database, DNS record or hosting account exists yet. No live base URL is claimed. User requested Google SMTP and will create accounts while implementation continues. No paid plan is authorized.

## Selected preparation

Prepare **Oracle Cloud Always Free Compute for NestJS + Neon Free PostgreSQL**, with Caddy for HTTPS. This is a recommendation subject to signup/capacity verification in the user's account. Oracle supports ordinary VM networking; its documented SMTP block targets port 25. Gmail uses TLS submission on 587/465, which still must be connectivity-tested from the created VM. [Oracle SMTP restriction](https://docs.oracle.com/en-us/iaas/releasenotes/changes/f7e95770-9844-43db-916c-6ccbaf2cfe24/index.htm).

Oracle's current Always Free allowance includes up to 2 A1 OCPUs / 12 GB total and 200 GB combined boot/block storage in the home region. Signup requires a qualifying payment card; free capacity may be unavailable, and idle instances can be reclaimed after seven days of low usage. Do not upgrade to paid, create non-eligible resources or rely on trial credits. A private rewrite container can share the VM initially; a separate VM is a later deployment choice within the allowance, not a server already provisioned. [Oracle limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [signup terms](https://www.oracle.com/cloud/free/).

Neon Free currently lists no time limit/no card requirement, 1 GB per project, 100 CU-hours monthly/project, up to 2 CU, and scale-to-zero after five minutes. Published Free plan includes 5 GB public network transfer/project/month; usage caps can suspend compute until reset. PostgreSQL storage persists independently of sleeping compute, but Free is not a production availability promise. Choose a nearby region, use a TLS connection URL and small connection pool. [Pricing](https://neon.com/pricing) · [plan details](https://neon.com/docs/introduction/plans).

## Alternatives checked

- Render Free: HTTPS, 750 instance-hours/workspace/month, sleeps after 15 idle minutes, cold start about a minute, ephemeral service filesystem. Free Postgres expires after 30 days; SMTP 25/465/587 blocked. Its prepared `render.yaml` is retained only as an **HTTPS-mail fallback** and is unsuitable for the requested direct Gmail SMTP path. [Official limits](https://render.com/docs/free).
- Koyeb: its general FAQ permits SMTP on 587, but current pricing/signup documentation mentions card verification and immediate prorated Pro charges, despite pages still mentioning a free instance. Do not register a paid plan to obtain this deployment. It is excluded from the zero-purchase path until a no-cost new-account signup is actually verified. [SMTP](https://www.koyeb.com/docs/faqs/general) · [billing](https://www.koyeb.com/docs/faqs/pricing).

## Account inputs needed

Oracle free account and an Always Free eligible VM/SSH access; Neon free account/connection URL; an API hostname with DNS pointing to the VM; a sender Gmail account/app password (or approved OAuth configuration), deep-link domains; approved deletion policy. AI additionally requires provider/model/free allowance/retention and service credentials. Avatar storage requires its own bucket and credentials. Supply secrets through ignored `.env.staging` and `.env.ai` or a secret manager, never chat/committed files.

## Deployment steps after accounts exist

1. Confirm the account's displayed compute/storage cost is zero and the image/shape is Always Free eligible. Do not accept a paid upgrade when capacity is unavailable. Install Docker/Compose on the VM. Open 80/443 inbound; SSH only from approved admin addresses. Keep DB and AI ports private.
2. Create Neon Free project. Save its TLS URL in `.env.staging` as DATABASE_URL, DATABASE_SSL=true. Set NODE_ENV=production, PORT=3100, TRUST_PROXY=true, random JWT_SECRET and separate encryption/service keys. Copy other approved settings from `.env.example`; never copy local passwords. Leave external integrations disabled until supplied.
3. Set API_DOMAIN to the DNS hostname. Confirm its A/AAAA record resolves to this VM. `deployment/Caddyfile` obtains/manages certificates; ACME requires public DNS and reachable 80/443. No domain or certificate has been created.
4. Run `docker compose -f deployment/compose.staging.yaml build api`, then `docker compose -f deployment/compose.staging.yaml up -d api proxy`. Startup explicitly migrates and seeds under an advisory lock. API filesystem is disposable; PostgreSQL and Caddy certificates persist separately.
5. With SMTP configured, test TLS connectivity and an explicitly authorized recipient, then verification/reset deep-link round trips. Queued is not delivered. Sleeping/paused database introduces cold-start delay.
6. To activate rewrite after provider approval, prepare `.env.ai` with AI_MODEL, provider key, matching AI_SERVICE_TOKEN and AI_RETENTION_APPROVED=true; **no database URL**. Set API AI_REWRITE_URL to `http://ai:3001/internal/v1/rewrite`, then start with `--profile rewrite`. The AI service is not published by Caddy or host ports.
7. Verify HTTPS `/health/ready`, registration, email verification, login/refresh/replay, onboarding under the approved strictly-over-18 policy with current profile weight only, injuries, ownership and deletion state. Populate an ignored Bruno staging environment with the **actual** HTTPS URL and run the relevant requests. Do not run disposable example.test-email smoke against Gmail delivery.
8. Record service IDs, region, migration SHA, last CI URL, external provider test results and actual base URL in DELIVERY_STATUS.md. Only then call routes live.

## Operation and rollback

Watch Neon quotas and Oracle reclamation/capacity notices. Keep encrypted DB exports outside the VM and test restore before real users. Do not create artificial traffic/load to evade free-tier limits. Initial migration rollback drops slice tables; take a backup and stop writes first. Prefer redeploying the previous compatible application image for an application-only rollback. The Docker named PostgreSQL volume in local Compose is separate from Neon.

PostgreSQL outbox jobs survive API restarts. They execute only while a process is awake. Gmail may reject/rate-limit mail; job errors remain pending and retry. Free availability, Gmail sending limits and provider retention must be rechecked before launch.
