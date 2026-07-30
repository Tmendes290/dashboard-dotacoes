-- ============================================================================
-- Milplan Flow Work — schema inicial
-- Rodar uma vez no SQL Editor do Supabase (painel do projeto -> SQL Editor).
-- ============================================================================

-- ── Numeração sequencial da SS (atômica, sem race condition) ────────────────
create sequence if not exists milplan_ss_numero_seq start 1;

-- Backfill: o último SS real emitido manualmente foi o SS-Milplan-031.
-- Isso garante que a primeira SS criada pelo sistema saia como 32, não repetindo número.
select setval('milplan_ss_numero_seq', 31, true);

create or replace function milplan_next_ss_numero()
returns int
language sql
volatile
as $$
  select nextval('milplan_ss_numero_seq')::int;
$$;

-- ── Tabela principal: uma linha por SS (estado atual) ───────────────────────
create table if not exists milplan_ss (
  id uuid primary key default gen_random_uuid(),
  ss_numero int not null unique,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviado','aguardando_retorno','recebido_com_ressalvas','em_analise','aprovado','reprovado','concluido')),

  pep text,
  nome_projeto_carteira text,

  contrato text default '5500132497',
  objeto_contrato text default 'CONTRATO DE EMPREITADA PARCIAL PARA SERVIÇOS DE MANUTENÇÃO, MONTAGEM E DESMONTAGEM ELETROMECÂNICA EM ATENDIMENTO A MINA DO SALOBO, LOCALIZADOS NOS MUNICÍPIOS DE MARABÁ NO ESTADO PARÁ COM FORNECIMENTO DE MATERIAIS Nº 5500132497',

  data_emissao date not null default current_date,
  prazo_plano date,

  gestor_contrato_area text default 'Gerência Projetos',
  gestor_contrato_nome text default 'Davison Oliveira',
  gestor_contrato_telefone text default '',

  lider_squad text,
  lider_nome text,
  lider_telefone text default '',

  planejador_nome text default '',

  preposto_area text default 'Milplan Engenharia',
  preposto_nome text default 'Adriano Manhago',
  preposto_telefone text default '',

  escopo text,

  revisao_atual int not null default 0,

  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  drive_folder_id text,
  pdf_atual_drive_file_id text
);

create index if not exists idx_milplan_ss_status on milplan_ss(status);
create index if not exists idx_milplan_ss_pep on milplan_ss(pep);

-- ── Histórico de revisões (append-only) ─────────────────────────────────────
create table if not exists milplan_ss_revisoes (
  id uuid primary key default gen_random_uuid(),
  ss_id uuid not null references milplan_ss(id) on delete cascade,
  numero_revisao int not null,
  motivo text not null,
  responsavel_nome text,
  criado_em timestamptz not null default now(),
  pdf_drive_file_id text
);

create index if not exists idx_milplan_ss_revisoes_ss_id on milplan_ss_revisoes(ss_id);

-- ── Anexos (PDFs gerados + retorno da Milplan) ──────────────────────────────
create table if not exists milplan_ss_anexos (
  id uuid primary key default gen_random_uuid(),
  ss_id uuid not null references milplan_ss(id) on delete cascade,
  tipo text not null check (tipo in ('ss_gerada','retorno_milplan')),
  nome_arquivo text not null,
  drive_file_id text not null,
  origem text not null check (origem in ('upload_manual','email_inbound','gerado_sistema')),
  enviado_por uuid references perfis(id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_milplan_ss_anexos_ss_id on milplan_ss_anexos(ss_id);

-- ── Trigger simples para manter atualizado_em em dia ────────────────────────
create or replace function milplan_touch_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_milplan_ss_touch on milplan_ss;
create trigger trg_milplan_ss_touch
  before update on milplan_ss
  for each row
  execute function milplan_touch_atualizado_em();

-- ── RLS: segue o mesmo padrão de leitura autenticada usado no resto do app ──
-- (ajustar conforme as policies já existentes em outras tabelas, ex. dotacoes/materiais)
alter table milplan_ss enable row level security;
alter table milplan_ss_revisoes enable row level security;
alter table milplan_ss_anexos enable row level security;

create policy "milplan_ss_select_authenticated" on milplan_ss
  for select using (auth.role() = 'authenticated');
create policy "milplan_ss_revisoes_select_authenticated" on milplan_ss_revisoes
  for select using (auth.role() = 'authenticated');
create policy "milplan_ss_anexos_select_authenticated" on milplan_ss_anexos
  for select using (auth.role() = 'authenticated');

-- Escritas (insert/update) passam pelo server.js com a service role key,
-- que ignora RLS — por isso não há policy de insert/update aqui de propósito,
-- igual ao padrão já usado em /api/save-medido e /api/save-materiais.
