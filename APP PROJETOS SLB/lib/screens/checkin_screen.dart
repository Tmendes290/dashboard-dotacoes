import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../data/dashboard_repository.dart';
import '../widgets/app_header.dart';
import '../widgets/section_label.dart';
import '../widgets/filter_picker.dart';
import '../widgets/touchable_list.dart';
import 'checkin_empresa_detail_screen.dart';
import 'checkin_fiscal_detail_screen.dart';

/// Turno pelo horário de Início — mesma janela do site (index.html
/// `impGetTurno`): Noite 23:00–06:00, Tarde 14:00–22:59, resto (ou sem
/// horário) vira ADM.
String _impTurno(int? inicioMin) {
  if (inicioMin == null) return 'adm';
  if (inicioMin >= 1380 || inicioMin <= 360) return 'noite';
  if (inicioMin >= 840 && inicioMin <= 1379) return 'tarde';
  return 'adm';
}

/// Se o Horário Ref. cai dentro da janela de Tarde/Noite, esse turno é
/// promovido pros KPIs principais (mesma regra do site `_impTurnoDoRef`).
String? _impTurnoDoRef(int refMin) {
  if (refMin >= 1380 || refMin <= 360) return 'noite';
  if (refMin >= 840 && refMin <= 1379) return 'tarde';
  return null;
}

/// dia da semana no estilo JS Date.getDay() (0=Dom...6=Sáb) a partir de
/// "YYYY-MM-DD", pra bater com a lógica original em vez do weekday do Dart
/// (1=Seg...7=Dom).
int? _dowJsStyle(String? dataSortKey) {
  if (dataSortKey == null || dataSortKey.isEmpty) return null;
  final d = DateTime.tryParse(dataSortKey);
  if (d == null) return null;
  return d.weekday % 7;
}

String _fmtDelay(int min) {
  if (min <= 0) return '—';
  if (min < 60) return '$min min';
  final h = min ~/ 60, m = min % 60;
  return '${h}h${m > 0 ? m.toString().padLeft(2, '0') : ''}';
}

String _fmtDateKey(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _fmtDateBr(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

/// Mesma lógica de `impApplyFilters()` do site: data (com fim de semana
/// excluído por padrão), Término Até, Obra (SAP) e Squad — Squad é derivado
/// aqui só via ref_squads (o site tem um segundo fallback por Fiscal que
/// não foi replicado, então uma fração pequena de registros sem SAP
/// cadastrado pode não entrar no filtro de Squad).
List<Map<String, dynamic>> _applyImpFilters(
  List<Map<String, dynamic>> all,
  Map<String, Map<String, String>> refSquads, {
  required String? dtIniKey,
  required String? dtFimKey,
  required Set<String> saps,
  required Set<String> squads,
  required int fimMin,
  required String todayKey,
}) {
  return all.where((d) {
    final dsk = d['data_sort_key']?.toString();
    if (dsk != null && dsk.isNotEmpty) {
      if (dsk.compareTo(todayKey) > 0) return false;
      if (dtIniKey != null && dsk.compareTo(dtIniKey) < 0) return false;
      if (dtFimKey != null && dsk.compareTo(dtFimKey) > 0) return false;
      final dow = _dowJsStyle(dsk);
      if (dow == 0 || dow == 6) return false;
    }
    final termino = (d['termino_min'] as num?)?.toInt();
    if (termino != null && termino > fimMin) return false;
    final sap = d['sap']?.toString() ?? '';
    if (saps.isNotEmpty && !saps.contains(sap)) return false;
    if (squads.isNotEmpty) {
      final sq = DashboardRepository.squadFor(refSquads, sap);
      if (!squads.contains(sq)) return false;
    }
    return true;
  }).toList();
}

class ImpStats {
  final int total;
  final int comAtraso;
  final int totalImprodMin;
  final int totalProdMin;
  final int totalEsperadoMin;
  final double? avgHorasMin;
  final int liquidoMin;
  final int avgProdMinC;
  final int avgImpMinC;
  final int pctProd, pctImp, pctProdC, pctImpC;
  // Registros do turno promovido já sem os "Desconsiderar" — usado pelos
  // rankings de empresa e aderência de fiscal, pra ficarem consistentes com
  // os cards acima em vez de recalcular o filtro de turno do zero.
  final List<Map<String, dynamic>> validos;
  const ImpStats({
    required this.total,
    required this.comAtraso,
    required this.totalImprodMin,
    required this.totalProdMin,
    required this.totalEsperadoMin,
    required this.avgHorasMin,
    required this.liquidoMin,
    required this.avgProdMinC,
    required this.avgImpMinC,
    required this.pctProd,
    required this.pctImp,
    required this.pctProdC,
    required this.pctImpC,
    required this.validos,
  });
}

/// Mesma lógica de `impRenderCards()` do site: filtra os registros do turno
/// promovido (ADM por padrão, salvo se o Horário Ref. cair em Tarde/Noite),
/// descarta os marcados "Desconsiderar", e calcula atraso/produtividade a
/// partir do Horário Ref. e Término Até escolhidos no filtro.
ImpStats computeImpStats(
  List<Map<String, dynamic>> filtered,
  int refMin,
  int fimMin,
) {
  final turnoDoRef = _impTurnoDoRef(refMin);
  final validos = filtered.where((d) {
    if ((d['acao']?.toString() ?? '') == 'Desconsiderar') return false;
    final turno = _impTurno((d['inicio_min'] as num?)?.toInt());
    return turno == 'adm' || turno == turnoDoRef;
  }).toList();

  int? baseOf(Map<String, dynamic> d) {
    final inicio = (d['inicio_min'] as num?)?.toInt();
    if (inicio != null) return inicio;
    final chegada = (d['chegada_min'] as num?)?.toInt();
    if (chegada != null) return chegada;
    return (d['pts_min'] as num?)?.toInt();
  }

  int delayOf(Map<String, dynamic> d) {
    final base = baseOf(d);
    if (base == null) return 0;
    final delay = base - refMin;
    return delay < 0 ? 0 : delay;
  }

  final total = validos.length;
  final comAtraso = validos.where((d) => delayOf(d) > 0).length;
  final totalImprodMin = validos.fold<int>(0, (s, d) => s + delayOf(d));

  final periodoBase = (fimMin - refMin) < 0 ? 0 : fimMin - refMin;
  final totalEsperadoMin = validos.fold<int>(0, (s, d) {
    final dow = _dowJsStyle(d['data_sort_key']?.toString()) ?? 1;
    final base = dow == 5
        ? ((periodoBase - 60) < 0 ? 0 : periodoBase - 60)
        : periodoBase;
    return s + base;
  });
  final totalProdMin = (totalEsperadoMin - totalImprodMin) < 0
      ? 0
      : totalEsperadoMin - totalImprodMin;
  final pctImp = totalEsperadoMin > 0
      ? (totalImprodMin / totalEsperadoMin * 100).round()
      : 0;
  final pctProd = 100 - pctImp;

  final comHoras = <int>[];
  for (final d in validos) {
    final inicio = (d['inicio_min'] as num?)?.toInt();
    final termino = (d['termino_min'] as num?)?.toInt();
    if (inicio != null && termino != null) {
      final almIni = (d['alm_ini_min'] as num?)?.toInt();
      final almFim = (d['alm_fim_min'] as num?)?.toInt();
      final almPausa = (almIni != null && almFim != null)
          ? ((almFim - almIni) < 0 ? 0 : almFim - almIni)
          : 0;
      comHoras.add(termino - inicio - almPausa);
    }
  }
  final avgHorasMin = comHoras.isEmpty
      ? null
      : comHoras.reduce((a, b) => a + b) / comHoras.length;

  final liquidoMin = (periodoBase - 60) < 0 ? 0 : periodoBase - 60;
  final avgProdMinC = avgHorasMin != null ? avgHorasMin.round() : 0;
  final avgImpMinC = (liquidoMin - avgProdMinC) < 0
      ? 0
      : liquidoMin - avgProdMinC;
  final pctProdC = liquidoMin > 0 ? (avgProdMinC / liquidoMin * 100).round() : 0;
  final pctImpC = 100 - pctProdC;

  return ImpStats(
    total: total,
    comAtraso: comAtraso,
    totalImprodMin: totalImprodMin,
    totalProdMin: totalProdMin,
    totalEsperadoMin: totalEsperadoMin,
    avgHorasMin: avgHorasMin,
    liquidoMin: liquidoMin,
    avgProdMinC: avgProdMinC,
    avgImpMinC: avgImpMinC,
    pctProd: pctProd,
    pctImp: pctImp,
    pctProdC: pctProdC,
    pctImpC: pctImpC,
    validos: validos,
  );
}

class EmpresaRank {
  final String empresa;
  final int total;
  final int noPrazo;
  final int pct;
  const EmpresaRank({
    required this.empresa,
    required this.total,
    required this.noPrazo,
    required this.pct,
  });
}

/// Ranking por empresa: % de registros sem atraso (mesmo Horário Ref. do
/// filtro) — equivalente ao `impChartFaixaEmp()` do site, mas usando o
/// horário configurável em vez do corte fixo de 08:00.
List<EmpresaRank> computeEmpresaRanking(
  List<Map<String, dynamic>> validos,
  int refMin,
) {
  final byE = <String, List<int>>{}; // [total, noPrazo]
  for (final d in validos) {
    final empresa = (d['empresa']?.toString() ?? '').trim();
    if (empresa.isEmpty) continue;
    final base = (d['inicio_min'] as num?)?.toInt() ??
        (d['chegada_min'] as num?)?.toInt() ??
        (d['pts_min'] as num?)?.toInt();
    if (base == null) continue;
    final e = byE.putIfAbsent(empresa, () => [0, 0]);
    e[0]++;
    if (base <= refMin) e[1]++;
  }
  final list = byE.entries
      .map(
        (e) => EmpresaRank(
          empresa: e.key,
          total: e.value[0],
          noPrazo: e.value[1],
          pct: e.value[0] > 0 ? (e.value[1] / e.value[0] * 100).round() : 0,
        ),
      )
      .toList()
    ..sort((a, b) {
      final byPct = b.pct.compareTo(a.pct);
      return byPct != 0 ? byPct : b.total.compareTo(a.total);
    });
  return list;
}

class FiscalAderencia {
  final String fiscal;
  final int registros;
  final int diasComRegistro;
  final int diasUteis;
  final int pct;
  const FiscalAderencia({
    required this.fiscal,
    required this.registros,
    required this.diasComRegistro,
    required this.diasUteis,
    required this.pct,
  });
}

/// Aderência dos fiscais: em quantos dos dias úteis do filtro cada fiscal
/// efetivamente lançou algum registro — equivalente ao
/// `impRenderAderenciaFiscais()` do site (versão simplificada: um total só,
/// sem quebrar por semana/mês, já que a tela é estreita).
List<FiscalAderencia> computeFiscalAderencia(List<Map<String, dynamic>> validos) {
  final diasUteis = <String>{};
  final porFiscal = <String, Set<String>>{};
  final registrosPorFiscal = <String, int>{};
  for (final d in validos) {
    final dsk = d['data_sort_key']?.toString();
    if (dsk == null || dsk.isEmpty) continue;
    diasUteis.add(dsk);
    final fiscal = (d['fiscal']?.toString() ?? '').trim();
    if (fiscal.isEmpty) continue;
    porFiscal.putIfAbsent(fiscal, () => {}).add(dsk);
    registrosPorFiscal[fiscal] = (registrosPorFiscal[fiscal] ?? 0) + 1;
  }
  final totalDias = diasUteis.length;
  final list = porFiscal.entries
      .map(
        (e) => FiscalAderencia(
          fiscal: e.key,
          registros: registrosPorFiscal[e.key] ?? 0,
          diasComRegistro: e.value.length,
          diasUteis: totalDias,
          pct: totalDias > 0 ? (e.value.length / totalDias * 100).round() : 0,
        ),
      )
      .toList()
    ..sort((a, b) => b.pct.compareTo(a.pct));
  return list;
}

class CheckinScreen extends StatefulWidget {
  const CheckinScreen({super.key});

  @override
  State<CheckinScreen> createState() => _CheckinScreenState();
}

class _CheckinData {
  final List<Map<String, dynamic>> registros;
  final Map<String, Map<String, String>> refSquads;
  _CheckinData(this.registros, this.refSquads);
}

class _CheckinScreenState extends State<CheckinScreen> {
  final _repo = DashboardRepository();
  late Future<_CheckinData> _future;

  Set<String> _selectedObras = {};
  Set<String> _selectedSquads = {};
  DateTimeRange? _periodo;
  TimeOfDay _horarioRef = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _terminoAte = const TimeOfDay(hour: 16, minute: 45);

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CheckinData> _load() async {
    final results = await Future.wait([
      _repo.fetchImprodutividade(),
      _repo.fetchRefSquads(),
    ]);
    return _CheckinData(
      results[0] as List<Map<String, dynamic>>,
      results[1] as Map<String, Map<String, String>>,
    );
  }

  // A aba fica viva o app inteiro (IndexedStack no ShellScreen) — sem isso, os
  // dados só atualizam reabrindo o app do zero.
  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  int get _refMin => _horarioRef.hour * 60 + _horarioRef.minute;
  int get _fimMin => _terminoAte.hour * 60 + _terminoAte.minute;

  Future<void> _pickPeriodo() async {
    final now = DateTime.now();
    final result = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: now,
      initialDateRange: _periodo,
      locale: const Locale('pt', 'BR'),
    );
    if (result != null) setState(() => _periodo = result);
  }

  Future<void> _pickTime(bool isRef) async {
    final result = await showTimePicker(
      context: context,
      initialTime: isRef ? _horarioRef : _terminoAte,
    );
    if (result != null) {
      setState(() => isRef ? _horarioRef = result : _terminoAte = result);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const AppHeader(
            eyebrow: 'Produtividade Projetos Salobo',
            title: 'Check-in',
            subtitle: 'Registro de chegada e atraso das equipes',
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.copper,
              onRefresh: _refresh,
              child: FutureBuilder<_CheckinData>(
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
                  if (data.registros.isEmpty) {
                    return _scrollableCenter(
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Nenhum registro importado ainda.\nImporte pelo Dashboard Dotações (aba Produtividade Projetos Salobo).',
                          textAlign: TextAlign.center,
                          style: AppText.body(size: 13, color: AppColors.muted),
                        ),
                      ),
                    );
                  }

                  final obras =
                      (<String>{
                        for (final r in data.registros)
                          if ((r['sap']?.toString() ?? '').isNotEmpty)
                            r['sap'].toString(),
                      }).toList()
                        ..sort();
                  final squads =
                      (<String>{
                        for (final r in data.registros)
                          DashboardRepository.squadFor(
                            data.refSquads,
                            r['sap']?.toString(),
                          ),
                      }..removeWhere((s) => s.isEmpty)).toList()
                        ..sort();

                  final todayKey = _fmtDateKey(DateTime.now());
                  final filtered = _applyImpFilters(
                    data.registros,
                    data.refSquads,
                    dtIniKey: _periodo != null
                        ? _fmtDateKey(_periodo!.start)
                        : null,
                    dtFimKey: _periodo != null
                        ? _fmtDateKey(_periodo!.end)
                        : null,
                    saps: _selectedObras,
                    squads: _selectedSquads,
                    fimMin: _fimMin,
                    todayKey: todayKey,
                  );
                  final stats = computeImpStats(filtered, _refMin, _fimMin);

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                    children: [
                      const SectionLabel(number: '01', title: 'Filtros'),
                      FilterPickerRow(
                        children: [
                          FilterPickerChip(
                            label: 'Obra (SAP)',
                            options: obras,
                            selected: _selectedObras,
                            onChanged: (v) =>
                                setState(() => _selectedObras = v),
                          ),
                          FilterPickerChip(
                            label: 'Squad',
                            options: squads,
                            selected: _selectedSquads,
                            onChanged: (v) =>
                                setState(() => _selectedSquads = v),
                          ),
                          _PeriodoChip(
                            periodo: _periodo,
                            onTap: _pickPeriodo,
                            onClear: () => setState(() => _periodo = null),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _TimeField(
                              label: 'Horário Ref.',
                              value: _horarioRef,
                              onTap: () => _pickTime(true),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _TimeField(
                              label: 'Término até',
                              value: _terminoAte,
                              onTap: () => _pickTime(false),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const SectionLabel(number: '02', title: 'Resumo'),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.35,
                        children: [
                          _StatCard(
                            color: AppColors.copper,
                            value: '${stats.total}',
                            label: 'Registros com horário',
                            sub: 'Chegada, PTS ou Início preenchidos',
                          ),
                          _StatCard(
                            color: AppColors.red,
                            value: '${stats.comAtraso}',
                            label: 'Com atraso',
                            sub: stats.total > 0
                                ? '${(stats.comAtraso / stats.total * 100).round()}% do total'
                                : '—',
                          ),
                          _StatCard(
                            color: AppColors.amber,
                            value: _fmtDelay(stats.totalImprodMin),
                            label: 'Total improdutivo',
                            sub: '${stats.totalImprodMin} min',
                          ),
                          _StatCard(
                            color: AppColors.green,
                            value: _fmtDelay(stats.totalProdMin),
                            label: 'Horas produtivas',
                            sub:
                                '${stats.pctProd}% prod. · ${stats.pctImp}% imp.',
                          ),
                          _StatCard(
                            color: AppColors.copperDeep,
                            value: stats.avgHorasMin != null
                                ? _fmtDelay(stats.avgHorasMin!.round())
                                : '—',
                            label: 'Média horas produtivas',
                            sub: 'por pessoa/dia',
                          ),
                          _StatCard(
                            color: AppColors.steel,
                            value: _fmtDelay(stats.liquidoMin),
                            label: 'Jornada líquida/equipe',
                            sub:
                                'Prod/p. ${_fmtDelay(stats.avgProdMinC)} · Imp/p. ${_fmtDelay(stats.avgImpMinC)}',
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Fim de semana não entra no cálculo por padrão. Turno considerado: ADM (07h–14h), ou Tarde/Noite se o Horário Ref. cair nessas janelas.',
                        style: AppText.body(size: 10.5, color: AppColors.muted),
                      ),
                      const SizedBox(height: 20),
                      _buildEmpresaRanking(stats),
                      const SizedBox(height: 20),
                      _buildAderenciaFiscais(stats, data.refSquads),
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

  StatusTone _toneForPct(int pct, {int okAt = 80, int waitAt = 50}) {
    if (pct >= okAt) return StatusTone.ok;
    if (pct >= waitAt) return StatusTone.wait;
    return StatusTone.warn;
  }

  Widget _buildEmpresaRanking(ImpStats stats) {
    final ranking = computeEmpresaRanking(stats.validos, _refMin);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          number: '03',
          title: 'Ranking de empresas',
          trailing: '${ranking.length} empresas',
        ),
        if (ranking.isEmpty)
          _emptyNote('Sem empresa preenchida nos registros filtrados.')
        else
          TouchableList(
            rows: ranking
                .map(
                  (e) => ListRowData(
                    name: e.empresa,
                    sub: '${e.total} registros · ${e.noPrazo} no prazo',
                    value: '${e.pct}%',
                    badgeText: e.pct >= 80
                        ? 'Ótimo'
                        : (e.pct >= 50 ? 'Atenção' : 'Crítico'),
                    tone: _toneForPct(e.pct),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => CheckinEmpresaDetailScreen(
                          empresa: e.empresa,
                          registros: stats.validos
                              .where(
                                (d) =>
                                    (d['empresa']?.toString() ?? '').trim() ==
                                    e.empresa,
                              )
                              .toList(),
                          refMin: _refMin,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
      ],
    );
  }

  Widget _buildAderenciaFiscais(
    ImpStats stats,
    Map<String, Map<String, String>> refSquads,
  ) {
    final aderencia = computeFiscalAderencia(stats.validos);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          number: '04',
          title: 'Aderência dos fiscais',
          trailing: '${aderencia.length} fiscais',
        ),
        if (aderencia.isEmpty)
          _emptyNote(
            'Preencha a coluna "Fiscal" na planilha pra ver a aderência.',
          )
        else ...[
          TouchableList(
            rows: aderencia
                .map(
                  (f) => ListRowData(
                    name: f.fiscal,
                    sub:
                        '${f.registros} registros · ${f.diasComRegistro} de ${f.diasUteis} dias úteis',
                    value: '${f.pct}%',
                    badgeText: f.pct >= 90
                        ? 'Em dia'
                        : (f.pct >= 50 ? 'Atenção' : 'Baixa aderência'),
                    tone: _toneForPct(f.pct, okAt: 90, waitAt: 50),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => CheckinFiscalDetailScreen(
                          fiscal: f.fiscal,
                          validos: stats.validos,
                          refSquads: refSquads,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 4),
          Text(
            '% de dias úteis do filtro em que o fiscal lançou pelo menos um registro.',
            style: AppText.body(size: 10.5, color: AppColors.muted),
          ),
        ],
      ],
    );
  }

  Widget _emptyNote(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AppText.body(size: 12, color: AppColors.muted),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final Color color;
  final String value;
  final String label;
  final String sub;
  const _StatCard({
    required this.color,
    required this.value,
    required this.label,
    required this.sub,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border(top: BorderSide(color: color, width: 3)),
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: AppText.display(size: 20, color: AppColors.ink),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: AppText.body(
              size: 10.5,
              color: AppColors.ink2,
              w: FontWeight.w600,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            style: AppText.body(size: 9.5, color: AppColors.muted),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _TimeField extends StatelessWidget {
  final String label;
  final TimeOfDay value;
  final VoidCallback onTap;
  const _TimeField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final h = value.hour.toString().padLeft(2, '0');
    final m = value.minute.toString().padLeft(2, '0');
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.line),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.access_time,
              size: 15,
              color: AppColors.muted,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label.toUpperCase(),
                    style: AppText.body(
                      size: 9,
                      color: AppColors.steel,
                      w: FontWeight.w600,
                    ).copyWith(letterSpacing: 0.4),
                  ),
                  Text(
                    '$h:$m',
                    style: AppText.body(
                      size: 13,
                      color: AppColors.ink2,
                      w: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PeriodoChip extends StatelessWidget {
  final DateTimeRange? periodo;
  final VoidCallback onTap;
  final VoidCallback onClear;
  const _PeriodoChip({
    required this.periodo,
    required this.onTap,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final isSet = periodo != null;
    final label = isSet
        ? '${_fmtDateBr(periodo!.start)} – ${_fmtDateBr(periodo!.end)}'
        : 'Todo o período';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: isSet ? AppColors.ink : AppColors.card,
          border: Border.all(color: isSet ? AppColors.ink : AppColors.line),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Período: ',
              style: AppText.body(
                size: 12,
                color: isSet ? Colors.white70 : AppColors.steel,
                w: FontWeight.w600,
              ),
            ),
            Flexible(
              child: Text(
                label,
                style: AppText.body(
                  size: 12,
                  color: isSet ? Colors.white : AppColors.ink2,
                  w: FontWeight.w700,
                ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
            if (isSet) ...[
              const SizedBox(width: 4),
              GestureDetector(
                onTap: onClear,
                child: const Icon(Icons.close, size: 14, color: Colors.white70),
              ),
            ] else ...[
              const SizedBox(width: 4),
              const Icon(
                Icons.expand_more,
                size: 16,
                color: AppColors.muted,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
