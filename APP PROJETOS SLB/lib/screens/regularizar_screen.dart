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
import '../widgets/status_badge.dart';

const _stopWords = {
  'LTDA',
  'EIRELI',
  'CONSTRUCOES',
  'CONSTRUCAO',
  'SERVICOS',
  'SERVICO',
  'ENGENHARIA',
};
const _accentedFrom = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const _accentedTo = 'AAAAAEEEEIIIIOOOOOUUUUCN';

String _stripAccents(String s) {
  final buf = StringBuffer();
  for (final ch in s.runes) {
    final c = String.fromCharCode(ch);
    final idx = _accentedFrom.indexOf(c);
    buf.write(idx >= 0 ? _accentedTo[idx] : c);
  }
  return buf.toString();
}

String _normEmp(String? s) {
  var up = _stripAccents((s ?? '').toUpperCase());
  up = up.replaceAll(RegExp(r'[^A-Z0-9]'), ' ');
  up = up.replaceAll(RegExp(r'\s+'), ' ').trim();
  return up;
}

List<String> _normVariants(String s) {
  final withAmp = _normEmp(s.replaceAll('&', 'E'));
  final withAmpCompact = withAmp.replaceAll(' ', '');
  final base = _normEmp(s);
  final compact = base.replaceAll(' ', '');
  final seen = <String>{};
  return [
    withAmp,
    withAmpCompact,
    base,
    compact,
  ].where((v) => v.length >= 2 && seen.add(v)).toList();
}

/// Mesma heurística de nome de empresa do site (index.html `matchEmpresa`) —
/// planilha CAPEX e cadastro de dotações raramente usam o nome exatamente
/// igual ("A&L" vs "A&L Construções Ltda"), então casa por variações/siglas.
bool _matchEmpresa(String? shortName, String? fullName) {
  final s = _normEmp(shortName);
  final f = _normEmp(fullName);
  if (s.isEmpty || f.isEmpty) return false;

  if (s.length >= 4 && f.contains(s)) return true;

  final fWords0 = f.split(' ');
  final fCompact = f.replaceAll(' ', '');
  for (final sv in _normVariants(shortName ?? '')) {
    if (sv.length < 2) continue;
    if (sv.length >= 4 && f.contains(sv)) return true;
    if (sv.length >= 3) {
      if (fWords0.contains(sv)) return true;
      if (fCompact.startsWith(sv)) return true;
    }
    if (sv.length >= 2 && sv.length <= 3) {
      if (f.startsWith('$sv ') || f == sv) return true;
    }
  }

  final sWords = s
      .split(' ')
      .where((w) => w.length >= 4 && !_stopWords.contains(w))
      .toList();
  if (sWords.isNotEmpty && sWords.every((w) => f.contains(w))) return true;

  final fWords = f
      .split(' ')
      .where((w) => w.length >= 4 && !_stopWords.contains(w))
      .toList();
  if (fWords.isNotEmpty && fWords.every((w) => s.contains(w))) return true;

  return false;
}

class RegularizarRow {
  final String pep;
  final String empresaCapex;
  final String? empresaDot;
  final int ndots;
  final String grupo;
  final double contratado;
  final double pago;
  final double aContratar;
  final double dotado;
  final double saldoDisp;
  final bool semContrato;
  const RegularizarRow({
    required this.pep,
    required this.empresaCapex,
    required this.empresaDot,
    required this.ndots,
    required this.grupo,
    required this.contratado,
    required this.pago,
    required this.aContratar,
    required this.dotado,
    required this.saldoDisp,
    required this.semContrato,
  });

  bool get needsReg => saldoDisp < 0 || semContrato;
  double get valorReg => semContrato ? pago : (saldoDisp < 0 ? -saldoDisp : 0);
}

class _CapexAgg {
  final String pep, empresa, grupo;
  double pago = 0, contratado = 0, aContratar = 0;
  _CapexAgg(this.pep, this.empresa, this.grupo);
}

/// Mesma lógica de `calcDivergencias()` do site (index.html): agrupa CAPEX
/// por PEP+Empresa+Grupo, casa com dotações abertas (STATUS != Reprovada)
/// pelo nome da empresa, e calcula o saldo disponível = Contratado − Pago −
/// A Contratar. Saldo negativo (ou pago sem contrato) = precisa regularizar.
List<RegularizarRow> calcDivergencias(
  List<Map<String, dynamic>> capex,
  List<Map<String, dynamic>> dotacoes,
) {
  final dotByPep = <String, List<Map<String, dynamic>>>{};
  for (final d in dotacoes) {
    if ((d['status']?.toString() ?? '') == 'Reprovada') continue;
    final pep = d['pep']?.toString() ?? '';
    if (pep.isEmpty) continue;
    dotByPep.putIfAbsent(pep, () => []).add(d);
  }

  final capexMap = <String, _CapexAgg>{};
  for (final row in capex) {
    final pep = row['pep']?.toString();
    final pago0 = asDouble(row['pago']);
    if (pep == null || pep.isEmpty || pago0 <= 0) continue;
    final empresa = row['empresa']?.toString() ?? '';
    final grupo = row['grupo']?.toString() ?? '';
    final key = '$pep|$empresa|$grupo';
    final agg = capexMap.putIfAbsent(key, () => _CapexAgg(pep, empresa, grupo));
    agg.pago += pago0;
    agg.contratado += asDouble(row['contratado']);
    agg.aContratar += asDouble(row['a_contratar']);
  }

  final result = <RegularizarRow>[];
  for (final agg in capexMap.values) {
    final contratadoR = agg.contratado * 1000000;
    final pagoR = agg.pago * 1000000;
    final aContratarR = agg.aContratar * 1000000;
    if (contratadoR <= 0 && pagoR <= 0) continue;

    final dotMatches = (dotByPep[agg.pep] ?? const <Map<String, dynamic>>[])
        .where((d) => _matchEmpresa(agg.empresa, d['empresa']?.toString()))
        .toList();
    final totalDotado = dotMatches.fold<double>(
      0,
      (s, d) => s + asDouble(d['total']),
    );
    final saldoDisp = contratadoR - pagoR - aContratarR;

    result.add(
      RegularizarRow(
        pep: agg.pep,
        empresaCapex: agg.empresa,
        empresaDot: dotMatches.isNotEmpty
            ? dotMatches.first['empresa']?.toString()
            : null,
        ndots: dotMatches.length,
        grupo: agg.grupo,
        contratado: contratadoR,
        pago: pagoR,
        aContratar: aContratarR,
        dotado: totalDotado,
        saldoDisp: saldoDisp,
        semContrato: contratadoR == 0 && pagoR > 0,
      ),
    );
  }
  result.sort(
    (a, b) => (a.dotado - a.contratado).compareTo(b.dotado - b.contratado),
  );
  return result;
}

class RegularizarScreen extends StatefulWidget {
  const RegularizarScreen({super.key});

  @override
  State<RegularizarScreen> createState() => _RegularizarScreenState();
}

class _RegularizarData {
  final List<Map<String, dynamic>> capex;
  final List<Map<String, dynamic>> dotacoes;
  _RegularizarData(this.capex, this.dotacoes);
}

enum _RegStatus { regularizar, semDotacao, coberto }

class _RegularizarScreenState extends State<RegularizarScreen> {
  final _repo = DashboardRepository();
  late Future<_RegularizarData> _future;
  final _searchCtrl = TextEditingController();
  String _search = '';
  Set<String> _selectedPeps = {};
  Set<String> _selectedEmpresas = {};
  Set<String> _selectedGrupos = {};
  Set<_RegStatus> _selectedStatus = {};
  final _money = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: '',
    decimalDigits: 0,
  );

  static const _grupos = [
    'ENGENHARIA',
    'FORNECIMENTO',
    'MONTAGEM ELETROMECÂNICA',
    'OBRAS CIVIS',
  ];

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

  Future<_RegularizarData> _load() async {
    final results = await Future.wait([
      _repo.fetchCapex(),
      _repo.fetchDotacoes(),
    ]);
    return _RegularizarData(
      results[0] as List<Map<String, dynamic>>,
      results[1] as List<Map<String, dynamic>>,
    );
  }

  // A aba fica viva o app inteiro (IndexedStack no ShellScreen) — sem isso, os
  // dados só atualizam reabrindo o app do zero.
  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const AppHeader(
            eyebrow: 'CAPEX × Dotações',
            title: 'Regularizar Saldo',
            subtitle: 'Divergências entre CAPEX medido e dotações abertas',
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.copper,
              onRefresh: _refresh,
              child: FutureBuilder<_RegularizarData>(
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
                  if (data.capex.isEmpty) {
                    return _scrollableCenter(
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Nenhuma planilha CAPEX importada ainda.\nImporte pelo Dashboard Dotações.',
                          textAlign: TextAlign.center,
                          style: AppText.body(size: 13, color: AppColors.muted),
                        ),
                      ),
                    );
                  }

                  final divs = calcDivergencias(data.capex, data.dotacoes);

                  final peps = (<String>{for (final r in divs) r.pep}).toList()
                    ..sort();
                  final empresas =
                      (<String>{for (final r in divs) r.empresaCapex}).toList()
                        ..sort();
                  final gruposPresentes =
                      (<String>{
                        for (final r in divs)
                          if (r.grupo.isNotEmpty) r.grupo,
                      }).toList()
                        ..sort();

                  final filtered = divs.where((r) {
                    if (_selectedPeps.isNotEmpty &&
                        !_selectedPeps.contains(r.pep))
                      return false;
                    if (_selectedEmpresas.isNotEmpty &&
                        !_selectedEmpresas.contains(r.empresaCapex))
                      return false;
                    if (_selectedGrupos.isNotEmpty &&
                        !_selectedGrupos.contains(r.grupo))
                      return false;
                    if (_selectedStatus.isNotEmpty) {
                      final st = r.semContrato
                          ? _RegStatus.semDotacao
                          : (r.saldoDisp < 0
                                ? _RegStatus.regularizar
                                : _RegStatus.coberto);
                      if (!_selectedStatus.contains(st)) return false;
                    }
                    if (_search.isNotEmpty) {
                      final haystack = '${r.pep} ${r.empresaCapex}'
                          .toLowerCase();
                      if (!haystack.contains(_search)) return false;
                    }
                    return true;
                  }).toList();

                  final nNeg = filtered.where((r) => r.needsReg).length;
                  final nPos = filtered.length - nNeg;
                  final sumNeg = filtered
                      .where((r) => r.needsReg)
                      .fold<double>(0, (s, r) => s + r.valorReg);
                  final sumPos = filtered
                      .where((r) => !r.needsReg)
                      .fold<double>(0, (s, r) => s + r.saldoDisp);

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                    children: [
                      const SectionLabel(number: '01', title: 'Resumo'),
                      HeroCard(
                        label: 'Total a regularizar',
                        prefix: 'R\$',
                        value: _money.format(sumNeg),
                        subtitle: '$nNeg PEP(s) com saldo negativo',
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '02', title: 'Buscar'),
                      TextField(
                        controller: _searchCtrl,
                        style: AppText.body(size: 14),
                        decoration: InputDecoration(
                          hintText: 'PEP ou empresa',
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
                      const SizedBox(height: 18),
                      const SectionLabel(number: '03', title: 'Filtros'),
                      FilterPickerRow(
                        children: [
                          FilterPickerChip(
                            label: 'PEP',
                            options: peps,
                            selected: _selectedPeps,
                            onChanged: (v) =>
                                setState(() => _selectedPeps = v),
                          ),
                          FilterPickerChip(
                            label: 'Empresa',
                            options: empresas,
                            selected: _selectedEmpresas,
                            onChanged: (v) =>
                                setState(() => _selectedEmpresas = v),
                          ),
                          FilterPickerChip(
                            label: 'Grupo',
                            options: _grupos
                                .where(gruposPresentes.contains)
                                .toList(),
                            selected: _selectedGrupos,
                            onChanged: (v) =>
                                setState(() => _selectedGrupos = v),
                          ),
                          FilterPickerChip(
                            label: 'Status',
                            options: const ['Regularizar', 'Pago sem dotação', 'Coberto'],
                            selected: _selectedStatus
                                .map(_statusLabel)
                                .toSet(),
                            onChanged: (labels) => setState(
                              () => _selectedStatus = labels
                                  .map(_statusFromLabel)
                                  .whereType<_RegStatus>()
                                  .toSet(),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '04', title: 'Indicadores'),
                      KpiChipsRow(
                        chips: [
                          KpiChipData(
                            label: 'A regularizar',
                            value: '$nNeg',
                            note: 'saldo negativo',
                            tone: nNeg > 0 ? StatusTone.warn : StatusTone.ok,
                          ),
                          KpiChipData(
                            label: 'Cobertos',
                            value: '$nPos',
                            note: 'saldo positivo',
                            tone: StatusTone.ok,
                          ),
                          KpiChipData(
                            label: 'Total coberto',
                            prefix: 'R\$',
                            value: _money.format(sumPos),
                            note: 'saldo disponível',
                            tone: StatusTone.neutral,
                          ),
                          KpiChipData(
                            label: 'CAPEX importado',
                            value: '${data.capex.length}',
                            note: '${peps.length} PEPs',
                            tone: StatusTone.neutral,
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      SectionLabel(
                        number: '05',
                        title: 'Por PEP',
                        trailing: '${filtered.length} itens',
                      ),
                      if (filtered.isEmpty)
                        Text(
                          'Nenhum registro com os filtros atuais.',
                          style: AppText.body(size: 12, color: AppColors.muted),
                        )
                      else
                        TouchableList(
                          rows: filtered.map((r) {
                            final label = r.semContrato
                                ? 'Pago s/ Contrato'
                                : (r.saldoDisp < 0
                                      ? 'Regularizar'
                                      : 'Coberto');
                            final tone = r.semContrato
                                ? StatusTone.warn
                                : (r.saldoDisp < 0
                                      ? StatusTone.wait
                                      : StatusTone.ok);
                            return ListRowData(
                              name: r.empresaCapex,
                              sub:
                                  'PEP ${r.pep}${r.grupo.isNotEmpty ? ' · ${r.grupo}' : ''}',
                              value: r.needsReg
                                  ? 'R\$ ${_money.format(r.valorReg)}'
                                  : 'R\$ ${_money.format(r.saldoDisp)}',
                              badgeText: label,
                              tone: tone,
                              onTap: () => _showDetail(context, r),
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

  String _statusLabel(_RegStatus s) => switch (s) {
    _RegStatus.regularizar => 'Regularizar',
    _RegStatus.semDotacao => 'Pago sem dotação',
    _RegStatus.coberto => 'Coberto',
  };

  _RegStatus? _statusFromLabel(String l) => switch (l) {
    'Regularizar' => _RegStatus.regularizar,
    'Pago sem dotação' => _RegStatus.semDotacao,
    'Coberto' => _RegStatus.coberto,
    _ => null,
  };

  Widget _scrollableCenter(Widget child) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(height: MediaQuery.of(context).size.height * 0.32),
        Center(child: child),
      ],
    );
  }

  void _showDetail(BuildContext context, RegularizarRow r) {
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label.toUpperCase(),
              style: AppText.body(
                size: 10.5,
                color: AppColors.steel,
                w: FontWeight.w600,
              ).copyWith(letterSpacing: 0.3),
            ),
          ),
          Expanded(
            child: Text(value, style: AppText.body(size: 13, color: AppColors.ink)),
          ),
        ],
      ),
    );

    final label = r.semContrato
        ? 'Pago s/ Contrato'
        : (r.saldoDisp < 0 ? 'Regularizar no CAPEX' : 'Coberto');
    final tone = r.semContrato
        ? StatusTone.warn
        : (r.saldoDisp < 0 ? StatusTone.wait : StatusTone.ok);

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.paper,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.9,
          expand: false,
          builder: (ctx, scrollController) {
            return ListView(
              controller: scrollController,
              padding: EdgeInsets.fromLTRB(
                18,
                16,
                18,
                24 + MediaQuery.of(ctx).viewInsets.bottom,
              ),
              children: [
                Container(
                  width: 36,
                  height: 3,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: AppColors.line,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        r.empresaCapex,
                        style: AppText.display(size: 19),
                      ),
                    ),
                    const SizedBox(width: 8),
                    StatusBadge(text: label, tone: tone),
                  ],
                ),
                const SizedBox(height: 18),
                row('PEP', r.pep),
                row('Grupo', r.grupo.isEmpty ? '—' : r.grupo),
                row(
                  'Empresa no sistema',
                  r.empresaDot ?? 'Sem dotação cadastrada',
                ),
                row('Dotações casadas', '${r.ndots}'),
                row('Contratado', 'R\$ ${_money.format(r.contratado)}'),
                row('Pago', 'R\$ ${_money.format(r.pago)}'),
                row('A contratar', 'R\$ ${_money.format(r.aContratar)}'),
                row('Total dotado', 'R\$ ${_money.format(r.dotado)}'),
                row('Saldo disponível', 'R\$ ${_money.format(r.saldoDisp)}'),
                if (r.needsReg)
                  row('Valor a regularizar', 'R\$ ${_money.format(r.valorReg)}'),
              ],
            );
          },
        );
      },
    );
  }
}
