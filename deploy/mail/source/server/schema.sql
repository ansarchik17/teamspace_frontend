CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), login text UNIQUE NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, password_history jsonb NOT NULL DEFAULT '[]', must_change boolean NOT NULL DEFAULT true,
 password_changed_at timestamptz NOT NULL DEFAULT now(), platform_admin boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 quota_mb integer NOT NULL DEFAULT 102400 CHECK(quota_mb>0), password_days integer NOT NULL DEFAULT 90 CHECK(password_days BETWEEN 1 AND 365),
 ai_enabled boolean NOT NULL DEFAULT false, consent_version integer NOT NULL DEFAULT 1,
 consent_text text NOT NULL DEFAULT 'Для работы в корпоративной почте необходимо согласие на обработку персональных данных. Это тестовый текст: перед промышленным запуском организация должна опубликовать утверждённый документ.',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text UNIQUE NOT NULL,
 verification_token text NOT NULL, verified boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES identities(id),
 role text NOT NULL CHECK(role IN ('tenant_admin','hr','user')), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 email text UNIQUE NOT NULL, quota_mb integer NOT NULL DEFAULT 5120 CHECK(quota_mb>0), department text NOT NULL DEFAULT '',
 signature text NOT NULL DEFAULT '', mail_backend text NOT NULL DEFAULT 'local' CHECK(mail_backend IN ('local','stalwart')),
 mail_secret text, mail_account_id text, created_at timestamptz DEFAULT now(), UNIQUE(tenant_id,user_id), UNIQUE(id,tenant_id)
);
CREATE TABLE IF NOT EXISTS sessions (
 id_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
 tenant_id uuid REFERENCES tenants(id), csrf text NOT NULL, expires_at timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES identities(id),
 version int NOT NULL, text_hash text NOT NULL, document_text text NOT NULL, accepted boolean NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_lookup ON consents(tenant_id,user_id,version,created_at DESC);
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), mailbox_id uuid NOT NULL,
 folder text NOT NULL DEFAULT 'inbox' CHECK(folder IN ('inbox','sent','drafts','archive','trash','spam')),
 sender text NOT NULL, recipients jsonb NOT NULL DEFAULT '[]', cc jsonb NOT NULL DEFAULT '[]', bcc jsonb NOT NULL DEFAULT '[]',
 subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', read boolean NOT NULL DEFAULT false, starred boolean NOT NULL DEFAULT false,
 size_bytes bigint NOT NULL DEFAULT 0, attachments jsonb NOT NULL DEFAULT '[]', delivery_status text NOT NULL DEFAULT 'delivered',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(mailbox_id,tenant_id) REFERENCES memberships(id,tenant_id)
);
CREATE INDEX IF NOT EXISTS message_list ON messages(mailbox_id,folder,created_at DESC);
CREATE TABLE IF NOT EXISTS attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), mailbox_id uuid NOT NULL,
 filename text NOT NULL, content_type text NOT NULL, data bytea NOT NULL, size_bytes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(mailbox_id,tenant_id) REFERENCES memberships(id,tenant_id)
);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES identities(id),
 title text NOT NULL, body text NOT NULL, kind text NOT NULL DEFAULT 'info', read boolean NOT NULL DEFAULT false,
 dedup_key text, created_at timestamptz DEFAULT now(), UNIQUE(user_id,tenant_id,dedup_key)
);
CREATE TABLE IF NOT EXISTS quota_states (mailbox_id uuid PRIMARY KEY REFERENCES memberships(id), threshold int NOT NULL DEFAULT 0, episode int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), actor_id uuid REFERENCES identities(id),
 action text NOT NULL, resource_id text, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_tenant ON audit_events(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS idempotency (
 mailbox_id uuid NOT NULL REFERENCES memberships(id), key text NOT NULL, request_hash text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY(mailbox_id,key)
);
CREATE TABLE IF NOT EXISTS outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), mailbox_id uuid NOT NULL REFERENCES memberships(id),
 message_id uuid NOT NULL REFERENCES messages(id), recipients jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
 attempts int NOT NULL DEFAULT 0, last_error text, next_attempt_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES identities(id),
 mailbox_id uuid NOT NULL REFERENCES memberships(id), message_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('summary','reply')),
 instruction text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', result text, error text, created_at timestamptz DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;

ALTER TABLE domains ADD COLUMN IF NOT EXISTS stalwart_id text;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_object_id text;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_sync_hash text;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_error text;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_used_bytes bigint NOT NULL DEFAULT 0;
-- Linked existing mailboxes retain their credentials, quotas and protocol permissions.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_managed boolean NOT NULL DEFAULT true;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_auth_failed boolean NOT NULL DEFAULT false;
-- A persisted reservation lets address changes resume after a remote timeout.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS mail_pending_email text;
CREATE UNIQUE INDEX IF NOT EXISTS memberships_pending_email_unique ON memberships(lower(mail_pending_email)) WHERE mail_pending_email IS NOT NULL;
CREATE OR REPLACE FUNCTION guard_mail_address_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(731824917);
 IF EXISTS(SELECT 1 FROM memberships m WHERE m.id<>NEW.id AND
   (lower(m.email)=lower(NEW.email) OR lower(m.mail_pending_email)=lower(NEW.email) OR
    (NEW.mail_pending_email IS NOT NULL AND (lower(m.email)=lower(NEW.mail_pending_email) OR lower(m.mail_pending_email)=lower(NEW.mail_pending_email)))))
 THEN RAISE EXCEPTION 'Mailbox address is reserved' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS memberships_address_reservation ON memberships;
CREATE TRIGGER memberships_address_reservation BEFORE INSERT OR UPDATE OF email,mail_pending_email ON memberships FOR EACH ROW EXECUTE FUNCTION guard_mail_address_reservation();
UPDATE memberships SET mail_managed=false
 WHERE mail_backend='stalwart' AND mail_object_id IS NULL AND mail_secret IS NOT NULL;

CREATE TABLE IF NOT EXISTS compose_meetings (
 mailbox_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
 draft_id text NOT NULL, settings jsonb NOT NULL,
 PRIMARY KEY(mailbox_id,draft_id)
);

CREATE TABLE IF NOT EXISTS calendar_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mailbox_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
 event_uid text NOT NULL,
 method text NOT NULL CHECK (method IN ('REQUEST','CANCEL','REPLY')),
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','failed','uncertain')),
 attempts int NOT NULL DEFAULT 0,
 last_error text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace is the authority for imported companies and people.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workspace_org_id uuid;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workspace_directory_checked_at timestamptz;
ALTER TABLE identities ADD COLUMN IF NOT EXISTS workspace_user_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_workspace_org_id_unique ON tenants(workspace_org_id);
CREATE UNIQUE INDEX IF NOT EXISTS identities_workspace_user_id_unique ON identities(workspace_user_id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_token text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS workspace_checked_at timestamptz;

-- Shared Workspace budget reserves the mail slice, including suspended accounts.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workspace_storage_bytes bigint CHECK(workspace_storage_bytes>=0);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workspace_storage_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION workspace_mail_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lim bigint; allocated bigint;
BEGIN
 SELECT workspace_storage_bytes INTO lim FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF lim IS NOT NULL THEN
  IF NOT NEW.mail_managed THEN RAISE EXCEPTION 'Unmanaged mailbox cannot use Workspace budget' USING ERRCODE='P7503'; END IF;
  SELECT COALESCE(SUM(quota_mb::bigint*1048576),0) INTO allocated FROM memberships WHERE tenant_id=NEW.tenant_id;
  IF allocated>lim THEN RAISE EXCEPTION 'Workspace mail allocation exceeds budget' USING ERRCODE='P7503'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workspace_mail_allocation_guard ON memberships;
CREATE TRIGGER workspace_mail_allocation_guard AFTER INSERT OR UPDATE OF quota_mb,tenant_id,mail_managed,mail_object_id,mail_backend ON memberships
 FOR EACH ROW EXECUTE FUNCTION workspace_mail_allocation_guard();
CREATE OR REPLACE FUNCTION workspace_mail_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated bigint;
BEGIN
 IF NEW.workspace_storage_bytes IS NOT NULL THEN
  SELECT COALESCE(SUM(quota_mb::bigint*1048576),0) INTO allocated FROM memberships WHERE tenant_id=NEW.id;
  IF allocated>NEW.workspace_storage_bytes THEN RAISE EXCEPTION 'Workspace mail budget below allocations' USING ERRCODE='P7503'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS workspace_mail_budget_guard ON tenants;
CREATE TRIGGER workspace_mail_budget_guard BEFORE UPDATE OF workspace_storage_bytes ON tenants
 FOR EACH ROW EXECUTE FUNCTION workspace_mail_budget_guard();
