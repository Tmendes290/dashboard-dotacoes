-- Tabela de histórico da aba "Índice de Produtividade" -- guarda cada comparativo
-- processado (projeto + empresa + resultado completo) pra poder consultar depois.
-- Rode isso no SQL Editor do Supabase (dono do projeto).

create table if not exists public.iprod_historico (
  id bigint generated always as identity primary key,
  projeto text not null,
  empresa text not null,
  praticabilidade numeric not null default 0,
  arquivo_contratada text,
  arquivo_projeto text,
  resultado jsonb not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_iprod_historico_projeto_empresa
  on public.iprod_historico (projeto, empresa);

alter table public.iprod_historico enable row level security;

drop policy if exists "leitura publica iprod_historico" on public.iprod_historico;
create policy "leitura publica iprod_historico"
  on public.iprod_historico for select
  using (true);

drop policy if exists "insercao publica iprod_historico" on public.iprod_historico;
create policy "insercao publica iprod_historico"
  on public.iprod_historico for insert
  with check (true);

drop policy if exists "exclusao publica iprod_historico" on public.iprod_historico;
create policy "exclusao publica iprod_historico"
  on public.iprod_historico for delete
  using (true);
