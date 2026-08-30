import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../data/dashboard_repository.dart';
import '../data/num_utils.dart';
import '../widgets/app_header.dart';
import '../widgets/section_label.dart';
import '../widgets/hero_card.dart';
import '../widgets/filter_picker.dart';
import '../widgets/touchable_list.dart';
import 'produtividade_detail_screen.dart';

class ProdutividadeScreen extends StatefulWidget {
  const ProdutividadeScreen({super.key});

  @override
  State<ProdutividadeScreen> createState() => _ProdutividadeScreenState();
}

class _ProdutividadeScreenState extends State<ProdutividadeScreen> {
  final _repo = DashboardRepository();
  late Future<List<Map<String, dynamic>>> _future;
  Set<String> _selectedSquads = {};
  Set<String> _selectedProjetos = {};

  @override
  void initState() {
    super.initState();
    _future = _repo.fetchIprodHistorico();
  }

  // A aba fica viva o app inteiro (IndexedStack no ShellScreen) — sem isso, os
  // dados só atualizam reabrindo o app do zero, mesmo com comparativo novo salvo.
  Future<void> _refresh() async {
    final next = _repo.fetchIprodHistorico();
    setState(() => _future = next);
    await next;
  }

  StatusTone _toneForIndice(double indice) {
    if (indice >= 0.95) return StatusTone.ok;
    if (indice >= 0.85) return StatusTone.wait;
    return StatusTone.warn;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const AppHeader(
            eyebrow: 'Índice de Produtividade',
            title: 'Produtividade',
            subtitle: 'Histórico de comparativos já processados',
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.copper,
              onRefresh: _refresh,
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return _scrollableCenter(
                      CircularProgressIndicator(color: AppColors.copper),
                    );
                  }
                  if (snap.hasError) {
                    return _scrollableCenter(
                      _errorState(snap.error.toString()),
                    );
                  }
                  // Só entram aqui comparativos já processados e salvos (histórico real).
                  final historico =
                      (snap.data ?? [])
                          .where((r) => (r['resultado'] as Map?) != null)
                          .toList()
                        ..sort(
                          (a, b) => (b['criado_em'] as String? ?? '').compareTo(
                            a['criado_em'] as String? ?? '',
                          ),
                        );
                  if (historico.isEmpty) {
                    return _scrollableCenter(_emptyState());
                  }

                  final squads = (<String>{
                    for (final r in historico)
                      (r['squad'] as String?)?.trim() ?? '',
                  }..removeWhere((s) => s.isEmpty)).toList()..sort();
                  final projetos = (<String>{
                    for (final r in historico)
                      (r['projeto'] as String?)?.trim() ?? '',
                  }..removeWhere((s) => s.isEmpty)).toList()..sort();
                  final visible = historico.where((r) {
                    if (_selectedSquads.isNotEmpty &&
                        !_selectedSquads.contains(
                          (r['squad'] as String?)?.trim(),
                        ))
                      return false;
                    if (_selectedProjetos.isNotEmpty &&
                        !_selectedProjetos.contains(
                          (r['projeto'] as String?)?.trim(),
                        ))
                      return false;
                    return true;
                  }).toList();

                  double totCobrado = 0, totRefAjust = 0;
                  for (final r in visible) {
                    final res = r['resultado'] as Map<String, dynamic>? ?? {};
                    totCobrado += asDouble(res['totCobrado']);
                    totRefAjust += asDouble(res['totRefAjust']);
                  }
                  final indiceGeral = totCobrado > 0
                      ? totRefAjust / totCobrado
                      : 0.0;

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                    children: [
                      const SectionLabel(
                        number: '01',
                        title: 'Índice geral do filtro',
                      ),
                      HeroCard(
                        label: 'Índice de Produtividade',
                        value: indiceGeral
                            .toStringAsFixed(2)
                            .replaceAll('.', ','),
                        subtitle:
                            '${visible.length} comparativos · HH referência ÷ HH cobrado · meta ≥ 0,90',
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '02', title: 'Filtros'),
                      FilterPickerRow(
                        children: [
                          FilterPickerChip(
                            label: 'Squad',
                            options: squads,
                            selected: _selectedSquads,
                            onChanged: (v) =>
                                setState(() => _selectedSquads = v),
                          ),
                          FilterPickerChip(
                            label: 'Obra',
                            options: projetos,
                            selected: _selectedProjetos,
                            onChanged: (v) =>
                                setState(() => _selectedProjetos = v),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      SectionLabel(
                        number: '03',
                        title: 'Histórico',
                        trailing: '${visible.length} comparativos',
                      ),
                      TouchableList(
                        rows: visible.map((r) {
                          final res =
                              r['resultado'] as Map<String, dynamic>? ?? {};
                          final cobrado = asDouble(res['totCobrado']);
                          final ref = asDouble(res['totRefAjust']);
                          final idx = cobrado > 0 ? ref / cobrado : 0.0;
                          final empresa =
                              r['empresa']?.toString() ?? '(sem contratada)';
                          final criadoEm = r['criado_em']?.toString();
                          final dataLabel =
                              criadoEm != null && criadoEm.length >= 10
                              ? criadoEm
                                    .substring(0, 10)
                                    .split('-')
                                    .reversed
                                    .join('/')
                              : '—';
                          return ListRowData(
                            name:
                                '${cobrado.toStringAsFixed(0)} HH lançadas por $empresa',
                            sub:
                                '${r['projeto'] ?? '—'} · ${r['squad'] ?? '—'} · $dataLabel',
                            value: idx.toStringAsFixed(2).replaceAll('.', ','),
                            badgeText: idx >= 0.95
                                ? 'Aderente'
                                : (idx >= 0.85 ? 'Atenção' : 'Não aderente'),
                            tone: _toneForIndice(idx),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    ProdutividadeDetailScreen(registro: r),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _scrollableCenter(Widget child) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(height: MediaQuery.of(context).size.height * 0.32),
        Center(child: child),
      ],
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Nenhum comparativo de produtividade salvo ainda.\nImporte pelo Dashboard Dotações (aba Índice de Produtividade).',
          textAlign: TextAlign.center,
          style: AppText.body(size: 13, color: AppColors.muted),
        ),
      ),
    );
  }

  Widget _errorState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Não foi possível carregar: $message',
          textAlign: TextAlign.center,
          style: AppText.body(size: 12, color: AppColors.red),
        ),
      ),
    );
  }
}
