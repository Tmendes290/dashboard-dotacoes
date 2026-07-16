-- Tabela de status de tratamento de casos (Telemetria: excesso de velocidade,
-- fadiga, uso de radio/celular, etc.) -- usada na secao "Status de Tratamento"
-- do Relatorio de Velocidade. Rode isso no SQL Editor do Supabase (dono do projeto).
-- Segue o mesmo padrao de blob JSON usado por vel_dados: uma linha (chave='main')
-- guardando o payload inteiro, sobrescrita a cada importacao.

create table if not exists public.telemetria_dados (
  chave text primary key,
  payload jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.telemetria_dados enable row level security;

drop policy if exists "leitura publica telemetria_dados" on public.telemetria_dados;
create policy "leitura publica telemetria_dados"
  on public.telemetria_dados for select
  using (true);
