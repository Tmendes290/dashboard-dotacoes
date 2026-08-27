-- Tabela de interdições/desvios de segurança (RAC) importadas da planilha
-- "Interações" do SESuite. Cada linha = uma pergunta de uma inspeção/auditoria
-- que gerou uma interdição ou desvio. Classificação por RAC (PNR-000069) e por
-- gravidade (VBM-PNR-000070 Anexo 01) é sugerida automaticamente por palavra-chave
-- e fica sujeita a revisão manual — por isso rac_manual/severidade_manual nunca
-- são sobrescritas por um novo upload (o upload só envia as colunas de dados
-- brutos + rac_auto/severidade_auto, nunca as colunas *_manual/revisado).
-- Rode isso no SQL Editor do Supabase (dono do projeto).

create table if not exists public.rac_interdicoes (
  chave text primary key,           -- numero_inspecao || '|' || numero_pergunta
  numero_inspecao text,
  numero_pergunta text,
  data_registro date,
  hora_registro text,               -- HH:MM
  data_ocorrencia date,
  hora_ocorrencia text,             -- HH:MM — usado pro histograma de horário
  unidade_organizacional text,
  titulo text,
  tipo_inspecao text,
  localizacao text,
  empresa text,
  inspetor text,
  pergunta text,
  resposta text,
  tipo_achado text,                 -- coluna "Tipo" da planilha (Interdição, etc.)
  observacao text,
  rac_auto text,                    -- ex.: 'RAC 01' — sugestão automática por palavra-chave
  rac_manual text,                  -- override manual (null = usa rac_auto)
  severidade_auto text,             -- 'pSIF' | 'baixo' — sugestão automática
  severidade_manual text,           -- override manual (null = usa severidade_auto)
  revisado boolean not null default false,
  revisado_por text,
  revisado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rac_interdicoes_data on public.rac_interdicoes (data_ocorrencia);
create index if not exists idx_rac_interdicoes_revisado on public.rac_interdicoes (revisado);

alter table public.rac_interdicoes enable row level security;

drop policy if exists "leitura publica rac_interdicoes" on public.rac_interdicoes;
create policy "leitura publica rac_interdicoes" on public.rac_interdicoes for select using (true);
drop policy if exists "insercao publica rac_interdicoes" on public.rac_interdicoes;
create policy "insercao publica rac_interdicoes" on public.rac_interdicoes for insert with check (true);
drop policy if exists "atualizacao publica rac_interdicoes" on public.rac_interdicoes;
create policy "atualizacao publica rac_interdicoes" on public.rac_interdicoes for update using (true) with check (true);
drop policy if exists "exclusao publica rac_interdicoes" on public.rac_interdicoes;
create policy "exclusao publica rac_interdicoes" on public.rac_interdicoes for delete using (true);

grant select, insert, update, delete on public.rac_interdicoes to authenticated, anon;
