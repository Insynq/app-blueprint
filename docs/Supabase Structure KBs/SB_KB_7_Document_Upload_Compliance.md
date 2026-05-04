# SB_KB_7 — Document Upload + Compliance Metadata

**Stack-portable concept. Supabase Storage implementation. Stack-locked: virus scanning sidecar pattern is infrastructure-specific.**

---

## Pattern

Users upload compliance documents (certificates, licenses, ID) with structured metadata. The system must: validate file type server-side, scan for malware asynchronously, store immutably with an audit log, enforce tenant isolation in storage, and produce short-lived signed URLs on demand — never public permanent links.

Upload flow: client → server endpoint validates metadata + returns signed upload URL → client uploads to storage → async worker validates magic bytes + scans → worker sets document status → admin verifies → signed URL generated on access.

Documents are append-only. Replacements create a new row that supersedes the old one. Nothing is overwritten or deleted.

---

## When to use / when to skip

**Use when:**
- Users upload regulated documents that may be audited by a third party
- Documents have metadata that must be validated (year, credit hours, expiration)
- You need to prove after the fact what was uploaded, when, and who accessed it

**Skip / simplify when:**
- Uploads are non-compliance (avatars, attachments) — skip async scanning, use standard Supabase Storage RLS
- Documents are internal-only with no audit requirement — skip the access log, use direct signed URLs

---

## Anti-patterns

**Public buckets for compliance documents**
Anyone with a URL gets the file. URLs live in browser history, Slack links, email threads. You lose the audit story the moment one URL leaks.

**Trusting `Content-Type` from the client**
The browser-supplied `Content-Type` header is trivially spoofed. A `.exe` renamed to `.pdf` uploads fine. Validate magic bytes server-side.

**Long-lived signed URLs**
Once issued, they bypass RLS and expire only at the URL level. Cap at 60–120 seconds. Generate fresh on every download request after an authorization check.

**Synchronous virus scanning in the upload request**
ClamAV cold start + freshclam DB (~250 MB) + scan time blows request budgets. Use async scanning with a `pending → scanning → clean/infected` status state machine.

**`x-upsert: true` on compliance documents**
Overwrites the existing file at the same storage path. Destroys audit trail. Every upload must create a new storage path.

**Storing only the file path, not the hash**
During an audit, you need to prove the bytes shown match the bytes uploaded. Store SHA-256 at upload time; re-verify on access if required.

**Serving PDFs inline**
PDFs can carry embedded JavaScript and actions. Force `Content-Disposition: attachment`. Render previews through a PDF.js worker isolated from your app origin.

**Stripping EXIF client-side only**
Client-side stripping can be bypassed. Re-encode images server-side (e.g., `sharp`) to strip EXIF/GPS before final storage.

---

## Generic example

```sql
-- Document registry: one row per upload, never updated after creation
create table compliance_documents (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  owner_id          uuid not null references profiles(id),
  storage_path      text not null unique,    -- bucket/org_id/owner_id/cycle_year/uuid.pdf
  original_filename text not null,
  mime_type         text not null
                    check (mime_type in ('application/pdf','image/png','image/jpeg')),
  file_size_bytes   bigint not null
                    check (file_size_bytes between 1 and 26214400),  -- 25 MB
  file_sha256       text not null,
  -- Domain metadata (adjust fields for your compliance type)
  document_type     text not null,           -- e.g., 'ce_certificate','license','id'
  issued_date       date,
  expiry_date       date,
  cycle_year        smallint,
  credit_hours      numeric(5,2),
  credit_type       text,
  jurisdiction      text,
  -- Processing state
  document_status   text not null default 'pending'
                    check (document_status in
                      ('pending','scanning','clean','infected','rejected','superseded')),
  -- Lineage: superseding documents point back to what they replace
  supersedes_id     uuid references compliance_documents(id),
  -- Provenance
  uploaded_by       uuid not null references profiles(id),
  uploaded_at       timestamptz not null default now(),
  verified_by       uuid references profiles(id),
  verified_at       timestamptz,
  verification_note text
);

-- Deduplicate within org by hash (prevents re-upload of same bytes)
create unique index on compliance_documents (file_sha256, org_id)
  where document_status not in ('rejected','infected');

create index on compliance_documents (owner_id, document_type, cycle_year);
create index on compliance_documents (org_id, document_status);
create index on compliance_documents (supersedes_id) where supersedes_id is not null;

-- Access log: immutable, append-only
create table document_access_log (
  id           bigserial primary key,
  document_id  uuid not null references compliance_documents(id),
  org_id       uuid not null,
  actor_id     uuid not null references profiles(id),
  actor_role   text not null,
  action       text not null
               check (action in ('upload','view','download','verify','export','audit_read')),
  ip_address   inet,
  user_agent   text,
  occurred_at  timestamptz not null default now()
);
revoke update, delete on document_access_log from authenticated, anon;
create index on document_access_log (document_id, occurred_at);
create index on document_access_log (actor_id, occurred_at);

-- -------------------------------------------------------
-- Storage RLS (Supabase-specific)
-- -------------------------------------------------------
-- Bucket: 'compliance-documents' (private)
-- Path convention: {org_id}/{owner_id}/{cycle_year}/{uuid}.{ext}

create policy "compliance: owner uploads to own path"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'compliance-documents'
  and (storage.foldername(name))[1] in (
    select org_id::text from org_memberships where user_id = auth.uid()
    union
    select primary_org_id::text from profiles where id = auth.uid()
  )
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- No SELECT policy on storage.objects — access only via server-side signed URLs
-- No UPDATE/DELETE policies — documents are immutable in storage

-- -------------------------------------------------------
-- RLS on document registry
-- -------------------------------------------------------
alter table compliance_documents enable row level security;

create policy "documents: owner reads own"
on compliance_documents for select to authenticated
using (
  owner_id = (select auth.uid())
  and document_status not in ('infected', 'rejected')
);

create policy "documents: org admin reads all in org"
on compliance_documents for select to authenticated
using (
  org_id = any ( array(select private.get_my_org_ids()) )
  and exists (
    select 1 from org_memberships m
    where m.user_id = (select auth.uid())
      and m.org_id = compliance_documents.org_id
      and m.role = 'admin'
  )
);

-- Inserts happen via server-side function only — no direct client insert policy
```

**Server-side signed URL generation (Next.js API route pattern):**
```ts
// Always log access before issuing URL
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServiceRoleClient(); // service role for log write
  const user = await getAuthenticatedUser(req);

  const doc = await getDocumentWithAuthCheck(params.id, user.id);
  if (!doc) return new Response('Not found', { status: 404 });

  // Log before issuing URL
  await supabase.from('document_access_log').insert({
    document_id: doc.id, org_id: doc.org_id,
    actor_id: user.id, actor_role: user.role,
    action: 'download',
    ip_address: req.headers.get('x-forwarded-for'),
    user_agent: req.headers.get('user-agent'),
  });

  // Short-lived signed URL (60s)
  const { data } = await supabase.storage
    .from('compliance-documents')
    .createSignedUrl(doc.storage_path, 60, {
      download: doc.original_filename,  // forces Content-Disposition: attachment
    });

  return Response.redirect(data!.signedUrl);
}
```

**Async scanning worker pattern:**
```ts
// Called by pg_cron, Supabase Edge Function on schedule, or queue worker
async function processPendingDocuments() {
  const pending = await getDocumentsWithStatus('pending');
  for (const doc of pending) {
    await setStatus(doc.id, 'scanning');
    try {
      const fileBytes = await downloadFromStorage(doc.storage_path);
      const detectedType = await detectMimeType(fileBytes);     // magic bytes
      if (detectedType !== doc.mime_type) throw new Error('mime_mismatch');
      const scanResult = await callClamAV(fileBytes);           // sidecar HTTP
      await setStatus(doc.id, scanResult.clean ? 'clean' : 'infected');
      if (!scanResult.clean) await moveToQuarantineBucket(doc.storage_path);
    } catch (err) {
      await setStatus(doc.id, 'rejected', err.message);
    }
  }
}
```

---

## Trade-offs

| Scanning approach | Detection quality | Infrastructure complexity | Latency |
|---|---|---|---|
| **ClamAV sidecar (Fly.io/ECS)** | Good; free | Medium — manage deployment | 2–30s async |
| **VirusTotal API** | Excellent (60+ engines) | Low — HTTP call | 5–60s; requires DPA |
| **Cloudmersive API** | Good | Low — HTTP call | 1–5s |
| **Skip scanning** | None | None | Instant | Only for non-compliance uploads |

**ClamAV cannot run in Supabase Edge Functions.** Edge Functions run in Deno Deploy which does not support native binaries or the 250 MB freshclam signature DB. External sidecar is required.

---

## Gotchas

**TUS resumable uploads are required for files over 6 MB in Supabase Storage.** Standard multipart upload fails. Use the `supabase-js` TUS client or `@uppy/tus`. The Supabase Storage TUS implementation enforces a 6 MB chunk requirement.

**`storage.foldername(name)[N]` is 1-indexed.** Folder `[1]` is the first segment of the path. Off-by-one in RLS path checks silently passes all uploads to the wrong org folder.

**SHA-256 must be computed on the client before requesting the signed upload URL.** Storage does not expose a hash API. Compute in the browser (`crypto.subtle.digest`) and send the hash with the metadata request, or compute server-side on the upload stream before writing to storage. Storing the hash at upload time is the only way to later verify integrity — there's no retroactive hashing path.

**Supersession is append-only and requires a distinct storage path per version.** When a user uploads a replacement document, insert a new row with `supersedes_id = old_doc_id` and update the old row's `document_status = 'superseded'`. Every upload must use a unique `storage_path` (include version or timestamp in the path) — never use `x-upsert: true` on compliance documents, since it overwrites in place and destroys the prior version. Never delete the old storage object — it's the audit record. If storage cost is a concern, move superseded files to a cold-storage bucket rather than deleting.

**Regulator audit access.** Create a separate read-only admin role that can see all documents for all orgs (service role on a restricted endpoint) and logs every access with `action = 'audit_read'`. Never give regulators direct Supabase credentials.
