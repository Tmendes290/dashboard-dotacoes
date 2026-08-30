import 'package:intl/intl.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../data/dashboard_repository.dart';
import '../data/num_utils.dart';
import '../widgets/app_header.dart';
import '../widgets/section_label.dart';
import '../widgets/hero_card.dart';
import '../widgets/kpi_chip.dart';
import '../widgets/filter_picker.dart';
import '../widgets/touchable_list.dart';
import 'cji3_detail_screen.dart';

class Cji3Screen extends StatefulWidget {
  const Cji3Screen({super.key});

  @override
  State<Cji3Screen> createState() => _Cji3ScreenState();
}

/// Só o MEDIDO (CJI3) — sem cruzar com dotação/orçamento, igual à seção
/// CJI3 do site (que também mostra só o que foi medido, não o comparativo
/// com dotação — pedido explícito do usuário: "quero saber apenas o que
/// mediu").
class _Cji3Data {
  final Map<String, dynamic>? cji3Payload;
  final Map<String, Map<String, String>> refSquads;
  _Cji3Data(this.cji3Payload, this.refSquads);
}

const _maxProjetosRenderizados = 300;

class _Cji3ScreenState extends State<Cji3Screen> {
  final _repo = DashboardRepository();
  late Future<_Cji3Data> _future;
  Set<String> _selectedSquads = {};
  Set<String> _selectedPeps = {};
  final _searchCtrl = TextEditingController();
  String _search = '';
  final _money = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: '',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _future = _load();
    _searchCtrl.addListener(
      () => setState(() => _search = _searchCtrl.text.trim().toLowerCase()),
    );
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // A aba fica viva o app inteiro (IndexedStack no ShellScreen) — sem isso, os
  // dados só atualizam reabrindo o app do zero.
  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  Future<_Cji3Data> _load() async {
    final results = await Future.wait([
      _repo.fetchCji3Payload(),
      _repo.fetchRefSquads(),
    ]);
    return _Cji3Data(
      results[0] as Map<String, dynamic>?,
      results[1] as Map<String, Map<String, String>>,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const AppHeader(
            eyebrow: 'SAP · CJI3',
            title: 'CJI3',
            subtitle: 'Valor medido/vendido por projeto',
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.copper,
              onRefresh: _refresh,
              child: FutureBuilder<_Cji3Data>(
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
                  final cji3Rows = (data.cji3Payload?['rows'] as List? ?? [])
                      .cast<Map<String, dynamic>>();

                  if (cji3Rows.isEmpty) {
                    return _scrollableCenter(
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Nenhum dado de CJI3 importado ainda.\nImporte pelo Dashboard Dotações.',
                          textAlign: TextAlign.center,
                          style: AppText.body(size: 13, color: AppColors.muted),
                        ),
                      ),
                    );
                  }

                  // squad por linha, derivado do PEP (proj) via ref_squads — mesma
                  // lógica de getSquadInfo() do site (PEP exato, senão prefixo antes do ponto).
                  String squadOfCji3(Map<String, dynamic> r) =>
                      DashboardRepository.squadFor(
                        data.refSquads,
                        r['proj']?.toString(),
                      );

                  final squadSet = <String>{
                    for (final r in cji3Rows) squadOfCji3(r),
                  }..removeWhere((s) => s.isEmpty);
                  final squads = squadSet.toList()..sort();

                  final pepSet = <String>{
                    for (final r in cji3Rows) r['proj']?.toString() ?? '',
                  }..removeWhere((s) => s.isEmpty);
                  final peps = pepSet.toList()..sort();

                  final cji3Visible = cji3Rows.where((r) {
                    if (_selectedSquads.isNotEmpty &&
                        !_selectedSquads.contains(squadOfCji3(r)))
                      return false;
                    if (_selectedPeps.isNotEmpty &&
                        !_selectedPeps.contains(r['proj']?.toString()))
                      return false;
                    if (_search.isNotEmpty) {
                      final haystack = [
                        r['proj'],
                        r['pname'],
                      ].map((v) => v?.toString().toLowerCase() ?? '').join(' ');
                      if (!haystack.contains(_search)) return false;
                    }
                    return true;
                  }).toList();

                  double totalMedido = 0;
                  for (final r in cji3Visible) {
                    final v = (r['v'] as Map?)?.cast<String, dynamic>() ?? {};
                    for (final val in v.values) {
                      totalMedido += asDouble(val);
                    }
                  }

                  // Agrupa medido por projeto (proj/pname), guardando as linhas originais
                  // (uma por fornecedor/WBS) pra permitir o detalhe por mês × empresa.
                  final porProjeto =
                      <
                        String,
                        ({
                          String nome,
                          double medido,
                          List<Map<String, dynamic>> rows,
                        })
                      >{};
                  for (final r in cji3Visible) {
                    final proj = r['proj']?.toString() ?? '—';
                    final nome = r['pname']?.toString() ?? proj;
                    final v = (r['v'] as Map?)?.cast<String, dynamic>() ?? {};
                    final soma = v.values.fold<double>(
                      0,
                      (s, val) => s + asDouble(val),
                    );
                    final cur =
                        porProjeto[proj] ??
                        (
                          nome: nome,
                          medido: 0.0,
                          rows: <Map<String, dynamic>>[],
                        );
                    cur.rows.add(r);
                    porProjeto[proj] = (
                      nome: cur.nome,
                      medido: cur.medido + soma,
                      rows: cur.rows,
                    );
                  }
                  final projEntries = porProjeto.entries.toList()
                    ..sort((a, b) => b.value.medido.compareTo(a.value.medido));

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                    children: [
                      const SectionLabel(number: '01', title: 'Resumo'),
                      HeroCard(
                        label: 'Valor medido / vendido (CJI3)',
                        prefix: 'R\$',
                        value: _money.format(totalMedido),
                        subtitle:
                            '${projEntries.length} projetos com lançamento',
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '02', title: 'Buscar'),
                      TextField(
                        controller: _searchCtrl,
                        style: AppText.body(size: 14),
                        decoration: InputDecoration(
                          hintText: 'PEP ou nome do projeto',
                          hintStyle: AppText.body(
                            size: 13,
                            color: AppColors.muted,
                          ),
                          prefixIcon: const Icon(
                            Icons.search,
                            color: AppColors.muted,
                            size: 20,
                          ),
                          filled: true,
                          fillColor: AppColors.card,
                          contentPadding: const EdgeInsets.symmetric(
                            vertical: 12,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: AppColors.line),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: AppColors.line),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(color: AppColors.copper),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '03', title: 'Filtros'),
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
                            label: 'Obra (PEP)',
                            options: peps,
                            selected: _selectedPeps,
                            onChanged: (v) =>
                                setState(() => _selectedPeps = v),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '04', title: 'Indicadores'),
                      KpiChipsRow(
                        chips: [
                          KpiChipData(
                            label: 'Medido total',
                            prefix: 'R\$',
                            value: _money.format(totalMedido),
                            note: 'CJI3 — só o medido',
                            tone: StatusTone.ok,
                          ),
                          KpiChipData(
                            label: 'Projetos',
                            value: '${projEntries.length}',
                            note: 'com lançamento no filtro',
                            tone: StatusTone.neutral,
                          ),
                          if (projEntries.isNotEmpty)
                            KpiChipData(
                              label: 'Maior lançamento',
                              prefix: 'R\$',
                              value: _money.format(
                                projEntries.first.value.medido,
                              ),
                              note: projEntries.first.value.nome,
                              tone: StatusTone.open,
                            ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      SectionLabel(
                        number: '05',
                        title: 'Por projeto',
                        trailing: '${projEntries.length} projetos',
                      ),
                      if (projEntries.length > _maxProjetosRenderizados)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Text(
                            'Mostrando os $_maxProjetosRenderizados maiores lançamentos — use os filtros ou a busca pra achar outros.',
                            style: AppText.body(
                              size: 11,
                              color: AppColors.muted,
                            ),
                          ),
                        ),
                      if (projEntries.isEmpty)
                        Text(
                          'Sem lançamentos de CJI3 para este filtro.',
                          style: AppText.body(size: 12, color: AppColors.muted),
                        )
                      else
                        TouchableList(
                          rows: projEntries.take(_maxProjetosRenderizados).map((e) {
                            return ListRowData(
                              name: e.value.nome,
                              sub: 'PEP ${e.key}',
                              value: 'R\$ ${_money.format(e.value.medido)}',
                              badgeText: 'Medido',
                              tone: StatusTone.ok,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => Cji3DetailScreen(
                                    projetoNome: e.value.nome,
                                    pep: e.key,
                                    rows: e.value.rows,
                                  ),
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
}
