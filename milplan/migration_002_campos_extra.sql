-- ============================================================================
-- Milplan Flow Work — migration 002: campos extras (modelo do card de referência)
-- Rodar uma vez no SQL Editor do Supabase, depois da migration.sql original.
-- ============================================================================

alter table milplan_ss add column if not exists inicio_previsto date;
alter table milplan_ss add column if not exists codigo_sap text default '';
alter table milplan_ss add column if not exists criado_por_nome text default '';
alter table milplan_ss add column if not exists visita text default 'Não' check (visita in ('Sim','Não'));
