# SB_KB_10 — Branded Transactional Email at Scale with Resend

**Stack-locked: Resend + Supabase Auth Send Email Hook. Email deliverability concepts are portable.**

---

## Pattern

Each org has its own logo, primary color, display name, and optional reply-to address. The default sending path uses a platform domain with the org's display name in the From header (`"Acme Realty via YourApp" <noreply@yourapp.com>` + `Reply-To: team@acmerealty.com`). Orgs that need full brand separation verify their own sending domain via Resend's Domains API and send from `noreply@mail.acmerealty.com`.

Auth emails (magic links, email confirmation) are customized via the **Supabase Auth Send Email Hook** — the only supported path for per-tenant branding on Supabase Auth emails. Project-wide custom SMTP cannot vary From by tenant.

Use `Idempotency-Key` on every Resend send. Use the transactional outbox from SB_KB_6 to ensure emails send only after the triggering DB transaction commits.

---

## When to use / when to skip

**Use when:**
- Tenants expect emails to come from their own brand, not yours
- You send auth emails (magic link, verification) that need per-tenant branding
- Email deliverability and per-tenant reputation isolation matter

**Skip / simplify when:**
- All tenants are fine with platform branding (`YourApp <noreply@yourapp.com>`)
- You're early-stage — ship the platform domain path first, add BYOD later

---

## Anti-patterns

**Sharing one verified domain across all tenants with only display name variation**
One bad send from any tenant harms every other tenant's reputation on that domain. Postmark explicitly warns against this. Use either per-tenant subdomain (`mail.acme.app.com`) or BYOD.

**Sending from tenant's apex domain**
`From: team@acmerealty.com` requires DKIM on `acmerealty.com`. Any misconfiguration affects their primary email flow. Push tenants to a `mail.` or `notifications.` subdomain.

**Magic link URL pointed at the tenant's custom domain**
Supabase tokens verify against the Supabase auth host (`your-project.supabase.co`). You can brand the email, but the verify link must always go to Supabase's auth endpoint, not a custom domain. Brand the body, not the link host.

**Configuring project-wide custom SMTP and trying to vary From dynamically**
Supabase's SMTP configuration is project-wide. It cannot vary From by tenant. Use the Send Email Hook instead.

**No idempotency key on auth emails**
Supabase retries the Send Email Hook on timeout or error. Without an idempotency key, the user receives duplicate magic links or verification emails.

**Mixing transactional and marketing sends in the same Resend project**
A marketing campaign that generates spam complaints degrades deliverability for your transactional emails (magic links, password resets). Use separate Resend projects or separate domains.

**`Reply-To` as the primary branding mechanism**
Many email clients hide `Reply-To`. The `From` display name is what users see. Make the display name reflect the tenant brand; use `Reply-To` for routing responses, not branding.

---

## Generic example

```sql
-- Per-tenant email configuration
create table org_email_config (
  org_id            uuid primary key references organizations(id),
  display_name      text not null,
  logo_url          text not null,
  brand_color       text not null default '#000000',
  reply_to          text,
  sending_mode      text not null default 'platform'
                    check (sending_mode in ('platform', 'custom_domain')),
  from_local_part   text not null default 'notifications',
  resend_domain_id  text,    -- returned by Resend Domains API on create
  resend_domain_name text,   -- e.g., "mail.acme.com"
  domain_status     text     -- 'pending' | 'verified' | 'failure'
                    check (domain_status in ('pending','verified','failure') or domain_status is null)
);
```

**From header builder:**
```ts
function buildFromHeader(config: OrgEmailConfig, platformDomain: string): string {
  if (config.sending_mode === 'custom_domain' && config.domain_status === 'verified') {
    // Tenant's own verified domain
    return `"${config.display_name}" <${config.from_local_part}@${config.resend_domain_name}>`;
  }
  // Platform domain with tenant display name
  // Gmail shows "via yourapp.com" in this case — inform tenants
  return `"${config.display_name} via YourApp" <noreply@${platformDomain}>`;
}
```

**Sending a transactional email:**
```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOrgEmail({
  orgId, toEmail, subject, template, idempotencyKey
}: SendParams) {
  const config = await getOrgEmailConfig(orgId);

  const { error } = await resend.emails.send(
    {
      from: buildFromHeader(config, 'yourapp.com'),
      to: toEmail,
      replyTo: config.reply_to ?? undefined,
      subject,
      react: template({ config }),  // React Email component with theme prop
      tags: [{ name: 'org_id', value: orgId }],
      headers: {
        // Required for bulk senders by Gmail (2024) and Outlook (May 2025)
        'List-Unsubscribe': `<https://yourapp.com/unsubscribe/${toEmail}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey }
  );
  if (error) throw new Error(`Resend error: ${error.message}`);
}
```

**Custom domain registration flow:**
```ts
async function registerCustomSendingDomain(orgId: string, domain: string) {
  // 1. Create domain in Resend
  const { data } = await resend.domains.create({
    name: domain,
    region: 'us-east-1',
    customReturnPath: 'send',  // enables custom Return-Path for bounce handling
  });

  // 2. Store domain ID, show DNS records to tenant
  await updateOrgEmailConfig(orgId, {
    resend_domain_id: data.id,
    resend_domain_name: domain,
    domain_status: 'pending',
  });

  // 3. Return DNS records for tenant to add
  return data.records;
  // Records include: DKIM TXT, SPF TXT, MX for Return-Path
  // Tenant must add all three before verification succeeds
}

// Called by webhook from Resend (domain.updated event) or by polling
async function checkDomainVerification(orgId: string) {
  const config = await getOrgEmailConfig(orgId);
  const { data } = await resend.domains.get(config.resend_domain_id!);

  const status = data.status === 'verified' ? 'verified' : 'pending';
  await updateOrgEmailConfig(orgId, { domain_status: status });
  return status;
}
```

**Supabase Auth Send Email Hook (per-tenant auth email branding):**
```ts
// Supabase → Auth → Hooks → Send Email Hook → your endpoint
// This is the ONLY way to brand auth emails per tenant in Supabase

export async function POST(req: Request) {
  const body = await req.json();

  // Verify the hook signature (Supabase signs with a secret)
  const signature = req.headers.get('x-supabase-signature');
  if (!verifyHookSignature(body, signature, process.env.HOOK_SECRET!)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { user, email_data } = body;
  const orgId = user.app_metadata?.org_id;  // set at user creation via service role
  const config = orgId ? await getOrgEmailConfig(orgId) : null;

  // Supabase tokens verify against the Supabase auth host — do not change this URL
  const verifyUrl = new URL('/auth/v1/verify', process.env.NEXT_PUBLIC_SUPABASE_URL!);
  verifyUrl.searchParams.set('token', email_data.token_hash);
  verifyUrl.searchParams.set('type', email_data.email_action_type);
  verifyUrl.searchParams.set('redirect_to', email_data.redirect_to);

  await sendOrgEmail({
    orgId: orgId ?? 'platform',
    toEmail: user.email,
    subject: subjectFor(email_data.email_action_type, config?.display_name),
    template: (props) => AuthEmail({
      ...props,
      action: email_data.email_action_type,
      verifyUrl: verifyUrl.toString(),
    }),
    // Idempotency key: action type + user + token hash
    idempotencyKey: `auth-${email_data.email_action_type}/${user.id}/${email_data.token_hash}`,
  });

  return new Response('{}', { status: 200 });
}
```

**React Email template with theme prop:**
```tsx
// components/emails/BaseEmail.tsx
import { Tailwind, Head, Body, Container, Img, Text, Button } from '@react-email/components';

interface Theme {
  brandColor: string;
  displayName: string;
  logoUrl: string;
}

export function BaseEmail({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <Tailwind config={{ theme: { extend: { colors: { brand: theme.brandColor } } } }}>
      <Head />
      <Body style={{ backgroundColor: '#f9fafb' }}>
        <Container>
          <Img src={theme.logoUrl} alt={theme.displayName} height={40} />
          {children}
        </Container>
      </Body>
    </Tailwind>
  );
}
```

---

## Trade-offs

| Sending mode | Brand fidelity | Setup complexity | Reputation isolation |
|---|---|---|---|
| **Platform domain + display name** | Low (Gmail shows "via yourapp.com") | None | Pooled |
| **Per-tenant subdomain under your apex** | Medium | Programmatic DNS via Resend API | Per-subdomain |
| **Tenant BYOD custom domain** | Highest | Tenant adds 3-4 DNS records | Fully isolated |
| **Hybrid (default platform, opt-in BYOD)** | Best of both | Moderate | Mixed — recommended |

---

## Gotchas

**Gmail (2024) and Outlook (May 2025) enforce bulk sender requirements.** If you send >5,000 emails/day to Gmail, you need: SPF, DKIM, DMARC `p=none` minimum, and one-click List-Unsubscribe. Non-compliance goes to spam. These apply at the sending domain level, not the From address.

**`email_change` with Secure Email Change enabled sends two tokens.** The Auth hook receives both `token_hash` (for the old address) and `token_hash_new` (for the new address). You must send both verification emails. Handle this in the hook by checking `email_data.email_action_type === 'email_change'`.

**Auto-degrade fallback.** If a tenant's domain status drops back to `pending` (DNS record removed, domain expires), continue sending from the platform domain rather than failing. Never drop emails because a tenant's DNS is misconfigured.

**Resend's `Idempotency-Key` deduplication window is 24 hours.** Keys older than 24 hours are not deduplicated. If you need longer deduplication (e.g., "never send this welcome email again"), track that in your own DB, not via Resend idempotency.

**Resend dedicated IPs** are available on the Scale plan ($30/mo) and require 500+ sends/day to maintain IP warmup. Not worth it until you exceed that volume. Before dedicated IPs, good list hygiene and low bounce rate matter more.

**Tenant's DMARC policy affects deliverability of your platform-domain emails.** If a tenant's domain has `p=reject` and your From header shows their display name "via yourapp.com," Gmail will still accept it (since DMARC aligns on the sending domain `yourapp.com`, not the display name). This is fine. The issue only arises if you try to send From the tenant's actual domain without proper DKIM.
