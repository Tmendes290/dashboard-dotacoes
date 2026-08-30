import 'package:intl/intl.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../data/dashboard_repository.dart';
import '../data/num_utils.dart';
import '../widgets/app_header.dart';
import '../widgets/section_label.dart';
import '../widgets/hero_card.dart';
import '../widgets/kpi_chip.dart';
import '../widgets/distribution_bar.dart';
import '../widgets/attention_card.dart';
import 'capex_screen.dart';

class _HomeData {
  final List<Map<String, dynamic>> capex;
  final Map<String, dynamic>? cji3Payload;
  final List<Map<String, dynamic>> iprodHistorico;
  final List<Map<String, dynamic>> materiaisResumo;
  _HomeData(
    this.capex,
    this.cji3Payload,
    this.iprodHistorico,
    this.materiaisResumo,
  );
}

class HomeScreen extends StatefulWidget {
  /// Chamado com o índice da aba do rodapé (ShellScreen) quando um
  /// indicador que corresponde a uma aba é tocado — ex.: Índice de
  /// Produtividade -> aba Produtividade, CJI3 Medido -> aba CJI3.
  final void Function(int tabIndex)? onNavigateToTab;
  const HomeScreen({super.key, this.onNavigateToTab});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _repo = DashboardRepository();
  late Future<_HomeData> _future;
  final _money = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: '',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  // A Home fica viva o app inteiro (IndexedStack no ShellScreen) — sem isso, os
  // dados só atualizam reabrindo o app do zero.
  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  Future<_HomeData> _load() async {
    final results = await Future.wait([
      _repo.fetchCapex(),
      _repo.fetchCji3Payload(),
      _repo.fetchIprodHistorico(),
      _repo.fetchMateriaisResumo(),
    ]);
    return _HomeData(
      results[0] as List<Map<String, dynamic>>,
      results[1] as Map<String, dynamic>?,
      results[2] as List<Map<String, dynamic>>,
      results[3] as List<Map<String, dynamic>>,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const AppHeader(
            eyebrow: 'Vale Base Metals · Salobo',
            title: 'Visão Geral',
            subtitle: 'Dotações · CAPEX · Produtividade',
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.copper,
              onRefresh: _refresh,
              child: FutureBuilder<_HomeData>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return _scrollableCenter(
                      CircularProgressIndicator(color: AppColors.copper),
                    );
                  }
                  if (snap.hasError) {
                    return _scrollableCenter(
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Não foi possível carregar: ${snap.error}',
                          textAlign: TextAlign.center,
                          style: AppText.body(size: 12, color: AppColors.red),
                        ),
                      ),
                    );
                  }
                  final data = snap.data!;

                  double totCapex = 0, totContratado = 0, totPago = 0;
                  for (final r in data.capex) {
                    totCapex += asReais(r['capex']);
                    totContratado += asReais(r['contratado']);
                    totPago += asReais(r['pago']);
                  }
                  final base = totCapex > 0 ? totCapex : 1;
                  final pago = totPago;
                  final emExecucao = (totContratado - totPago).clamp(
                    0,
                    double.infinity,
                  );
                  final aContratar = (totCapex - totContratado).clamp(
                    0,
                    double.infinity,
                  );

                  double totMedidoCji3 = 0;
                  final cji3Rows = (data.cji3Payload?['rows'] as List? ?? []);
                  for (final r in cji3Rows) {
                    final v =
                        ((r as Map)['v'] as Map?)?.cast<String, dynamic>() ??
                        {};
                    for (final val in v.values) {
                      totMedidoCji3 += asDouble(val);
                    }
                  }

                  // Índice geral: último comparativo salvo por squad, agregado.
                  final latestPerSquad = <String, Map<String, dynamic>>{};
                  for (final r in data.iprodHistorico) {
                    final squad = (r['squad'] as String?)?.trim();
                    if (squad == null || squad.isEmpty) continue;
                    final existing = latestPerSquad[squad];
                    if (existing == null ||
                        (r['criado_em'] as String).compareTo(
                              existing['criado_em'] as String,
                            ) >
                            0) {
                      latestPerSquad[squad] = r;
                    }
                  }
                  double totCobrado = 0, totRefAjust = 0;
                  final squadsAbaixoMeta = <String>[];
                  for (final r in latestPerSquad.values) {
                    final res = r['resultado'] as Map<String, dynamic>? ?? {};
                    final c = asDouble(res['totCobrado']);
                    final ref = asDouble(res['totRefAjust']);
                    totCobrado += c;
                    totRefAjust += ref;
                    if (c > 0 && (ref / c) < 0.85)
                      squadsAbaixoMeta.add(r['squad'] as String);
                  }
                  final indiceGeral = totCobrado > 0
                      ? totRefAjust / totCobrado
                      : 0.0;

                  var materiaisAtraso = 0;
                  for (final item in data.materiaisResumo) {
                    final situacao = (item['situacao']?.toString() ?? '')
                        .toLowerCase();
                    if (situacao.contains('entregue')) continue;
                    final prev = item['prevEntrega']?.toString();
                    if (prev == null || prev.length < 10) continue;
                    final parts = prev.split('/');
                    if (parts.length < 3) continue;
                    final d = int.tryParse(parts[0]),
                        m = int.tryParse(parts[1]),
                        y = int.tryParse(parts[2]);
                    if (d == null || m == null || y == null) continue;
                    final entrega = DateTime(y, m, d);
                    final hoje = DateTime.now();
                    if (entrega.isBefore(
                      DateTime(hoje.year, hoje.month, hoje.day),
                    ))
                      materiaisAtraso++;
                  }

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                    children: [
                      const SectionLabel(number: '01', title: 'Resumo'),
                      HeroCard(
                        label: 'Índice de Produtividade Geral',
                        value: indiceGeral.toStringAsFixed(2).replaceAll(
                          '.',
                          ',',
                        ),
                        subtitle: squadsAbaixoMeta.isEmpty
                            ? 'todos os squads dentro da meta (≥ 0,90)'
                            : '${squadsAbaixoMeta.length} squad(s) abaixo da meta de 0,90',
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(
                        number: '02',
                        title: 'Indicadores',
                      ),
                      KpiChipsRow(
                        chips: [
                          KpiChipData(
                            label: 'Índice Produtividade',
                            value: indiceGeral
                                .toStringAsFixed(2)
                                .replaceAll('.', ','),
                            note: indiceGeral >= 0.90
                                ? 'dentro da meta'
                                : 'abaixo da meta',
                            tone: indiceGeral >= 0.90
                                ? StatusTone.ok
                                : StatusTone.warn,
                            onTap: () => widget.onNavigateToTab?.call(1),
                          ),
                          KpiChipData(
                            label: 'CJI3 Medido',
                            prefix: 'R\$',
                            value: _money.format(totMedidoCji3),
                            note: 'total lançado',
                            tone: StatusTone.neutral,
                            onTap: () => widget.onNavigateToTab?.call(2),
                          ),
                          KpiChipData(
                            label: 'CAPEX a contratar',
                            prefix: 'R\$',
                            value: _money.format(aContratar),
                            note: base > 0
                                ? '${(aContratar / base * 100).toStringAsFixed(0)}% do total'
                                : '—',
                            tone: StatusTone.wait,
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const CapexScreen(),
                              ),
                            ),
                          ),
                          KpiChipData(
                            label: 'Materiais em atraso',
                            value: '$materiaisAtraso itens',
                            note: materiaisAtraso > 0
                                ? 'requer ação'
                                : 'em dia',
                            tone: materiaisAtraso > 0
                                ? StatusTone.warn
                                : StatusTone.ok,
                            onTap: () => widget.onNavigateToTab?.call(3),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(
                        number: '03',
                        title: 'Distribuição do CAPEX',
                      ),
                      DistributionBar(
                        segments: [
                          DistributionSegment(
                            weight: pago / base,
                            label: 'Pago',
                            pctLabel: 'R\$ ${_money.format(pago)}',
                            tone: StatusTone.ok,
                          ),
                          DistributionSegment(
                            weight: emExecucao / base,
                            label: 'Contratado (a pagar)',
                            pctLabel: 'R\$ ${_money.format(emExecucao)}',
                            tone: StatusTone.wait,
                          ),
                          DistributionSegment(
                            weight: aContratar / base,
                            label: 'A contratar',
                            pctLabel: 'R\$ ${_money.format(aContratar)}',
                            tone: StatusTone.open,
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(
                        number: '04',
                        title: 'Pontos de decisão',
                      ),
                      if (squadsAbaixoMeta.isEmpty && materiaisAtraso == 0)
                        Text(
                          'Nenhum ponto crítico no momento.',
                          style: AppText.body(size: 12, color: AppColors.muted),
                        )
                      else
                        AttentionList(
                          items: [
                            for (final s in squadsAbaixoMeta)
                              AttentionItem(
                                severity: AttentionSeverity.pending,
                                title: 'Squad $s com desvio de produtividade.',
                                description: 'Índice abaixo de 0,85 no último comparativo salvo.',
                              ),
                            if (materiaisAtraso > 0)
                              AttentionItem(
                                severity: AttentionSeverity.pending,
                                title: 'Materiais em atraso.',
                                description:
                                    '$materiaisAtraso itens com entrega vencida.',
                              ),
                          ],
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
}
