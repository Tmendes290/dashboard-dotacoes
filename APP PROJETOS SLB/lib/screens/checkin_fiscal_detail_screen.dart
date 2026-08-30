import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../data/dashboard_repository.dart';
import '../widgets/section_label.dart';
import '../widgets/hero_card.dart';
import '../widgets/touchable_list.dart';

enum _Gran { dia, semana, mes }

int? _baseOf(Map<String, dynamic> d) {
  final inicio = (d['inicio_min'] as num?)?.toInt();
  if (inicio != null) return inicio;
  final chegada = (d['chegada_min'] as num?)?.toInt();
  if (chegada != null) return chegada;
  return (d['pts_min'] as num?)?.toInt();
}

String _fmtHora(int? min) {
  if (min == null) return '—';
  final h = (min ~/ 60) % 24, m = min % 60;
  return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
}

String _fmtDataLabel(String dsk) =>
    dsk.length >= 10 ? dsk.substring(0, 10).split('-').reversed.join('/') : '—';

// Semana ISO 8601 — mesma convenção do `_impWeekKey` do site (a semana
// pertence ao ano da quinta-feira que ela contém).
int _isoWeekNumber(DateTime d) {
  final thursday = d.add(Duration(days: 4 - d.weekday));
  final firstDayOfYear = DateTime(thursday.year, 1, 1);
  return ((thursday.difference(firstDayOfYear).inDays) / 7).floor() + 1;
}

String _weekKey(String dsk) {
  final d = DateTime.parse(dsk);
  final thursday = d.add(Duration(days: 4 - d.weekday));
  return '${thursday.year}-W${_isoWeekNumber(d).toString().padLeft(2, '0')}';
}

const _meses = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

class _PeriodBucket {
  final String key;
  int diasUteis = 0;
  int diasComRegistro = 0;
  int registros = 0;
  String? minDsk;
  String? maxDsk;
  _PeriodBucket(this.key);
}

StatusTone _toneForPct(int pct) {
  if (pct >= 90) return StatusTone.ok;
  if (pct >= 50) return StatusTone.wait;
  return StatusTone.warn;
}

/// Detalhe de UM fiscal: squad, todos os registros dele no filtro atual, e a
/// aderência (dias úteis do filtro em que ele lançou algo) quebrada por dia,
/// semana ou mês — alterna via o seletor da seção 02.
class CheckinFiscalDetailScreen extends StatefulWidget {
  final String fiscal;
  /// TODOS os registros válidos do filtro de Check-in (não só os desse
  /// fiscal) — precisa disso pra saber o denominador de dias úteis.
  final List<Map<String, dynamic>> validos;
  final Map<String, Map<String, String>> refSquads;

  const CheckinFiscalDetailScreen({
    super.key,
    required this.fiscal,
    required this.validos,
    required this.refSquads,
  });

  @override
  State<CheckinFiscalDetailScreen> createState() =>
      _CheckinFiscalDetailScreenState();
}

class _CheckinFiscalDetailScreenState
    extends State<CheckinFiscalDetailScreen> {
  _Gran _gran = _Gran.semana;

  @override
  Widget build(BuildContext context) {
    final meus =
        widget.validos
            .where(
              (d) => (d['fiscal']?.toString() ?? '').trim() == widget.fiscal,
            )
            .toList()
          ..sort(
            (a, b) => (b['data_sort_key']?.toString() ?? '').compareTo(
              a['data_sort_key']?.toString() ?? '',
            ),
          );

    final diasUteis = <String>{};
    for (final d in widget.validos) {
      final dsk = d['data_sort_key']?.toString();
      if (dsk != null && dsk.isNotEmpty) diasUteis.add(dsk);
    }
    final registrosPorDia = <String, int>{};
    final diasComRegistro = <String>{};
    for (final d in meus) {
      final dsk = d['data_sort_key']?.toString();
      if (dsk == null || dsk.isEmpty) continue;
      diasComRegistro.add(dsk);
      registrosPorDia[dsk] = (registrosPorDia[dsk] ?? 0) + 1;
    }
    final pct = diasUteis.isNotEmpty
        ? (diasComRegistro.length / diasUteis.length * 100).round()
        : 0;

    // Squad: o mais frequente entre os SAPs dos registros desse fiscal.
    final squadCount = <String, int>{};
    for (final d in meus) {
      final sq = DashboardRepository.squadFor(
        widget.refSquads,
        d['sap']?.toString(),
      );
      if (sq.isEmpty) continue;
      squadCount[sq] = (squadCount[sq] ?? 0) + 1;
    }
    final squad = squadCount.isEmpty
        ? '(sem squad)'
        : (squadCount.entries.toList()
                ..sort((a, b) => b.value.compareTo(a.value)))
              .first
              .key;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.ink,
        foregroundColor: AppColors.headerText,
        title: Text(
          widget.fiscal,
          style: AppText.display(size: 18, color: AppColors.headerText),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
        children: [
          const SectionLabel(number: '01', title: 'Resumo'),
          HeroCard(
            label: 'Aderência no filtro atual',
            value: '$pct%',
            subtitle:
                'Squad $squad · ${diasComRegistro.length} de ${diasUteis.length} dias úteis · ${meus.length} registros',
          ),
          const SizedBox(height: 20),
          const SectionLabel(number: '02', title: 'Aderência por período'),
          _granToggle(),
          const SizedBox(height: 10),
          _periodBreakdown(diasUteis, diasComRegistro, registrosPorDia),
          const SizedBox(height: 20),
          SectionLabel(
            number: '03',
            title: 'Registros',
            trailing: '${meus.length} registros',
          ),
          if (meus.isEmpty)
            Text(
              'Nenhum registro desse fiscal no filtro atual.',
              style: AppText.body(size: 12, color: AppColors.muted),
            )
          else
            TouchableList(
              rows: meus.map((d) {
                final base = _baseOf(d);
                final sap = d['sap']?.toString() ?? '—';
                final empresa = d['empresa']?.toString() ?? '—';
                return ListRowData(
                  name: _fmtDataLabel(d['data_sort_key']?.toString() ?? ''),
                  sub: 'Obra $sap · $empresa · horário ${_fmtHora(base)}',
                  value: '',
                  badgeText: 'Registro',
                  tone: StatusTone.neutral,
                );
              }).toList(),
            ),
        ],
      ),
    );
  }

  Widget _granToggle() {
    Widget chip(_Gran g, String label) {
      final active = _gran == g;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _gran = g),
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: active ? AppColors.ink : AppColors.card,
              border: Border.all(color: active ? AppColors.ink : AppColors.line),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              label,
              style: AppText.body(
                size: 12,
                w: FontWeight.w700,
                color: active ? Colors.white : AppColors.ink2,
              ),
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        chip(_Gran.dia, 'Dia'),
        const SizedBox(width: 8),
        chip(_Gran.semana, 'Semana'),
        const SizedBox(width: 8),
        chip(_Gran.mes, 'Mês'),
      ],
    );
  }

  Widget _periodBreakdown(
    Set<String> diasUteis,
    Set<String> diasComRegistro,
    Map<String, int> registrosPorDia,
  ) {
    if (_gran == _Gran.dia) {
      final dias = diasUteis.toList()..sort((a, b) => b.compareTo(a));
      if (dias.isEmpty) return _emptyNote('Sem dias úteis no filtro atual.');
      return TouchableList(
        rows: dias.map((dsk) {
          final registrou = diasComRegistro.contains(dsk);
          final n = registrosPorDia[dsk] ?? 0;
          return ListRowData(
            name: _fmtDataLabel(dsk),
            sub: registrou ? '$n registro${n > 1 ? 's' : ''}' : 'Sem lançamento',
            value: registrou ? 'OK' : '—',
            badgeText: registrou ? 'Registrou' : 'Faltou',
            tone: registrou ? StatusTone.ok : StatusTone.warn,
          );
        }).toList(),
      );
    }

    final buckets = <String, _PeriodBucket>{};
    for (final dsk in diasUteis) {
      final key = _gran == _Gran.semana ? _weekKey(dsk) : dsk.substring(0, 7);
      final b = buckets.putIfAbsent(key, () => _PeriodBucket(key));
      b.diasUteis++;
      if (b.minDsk == null || dsk.compareTo(b.minDsk!) < 0) b.minDsk = dsk;
      if (b.maxDsk == null || dsk.compareTo(b.maxDsk!) > 0) b.maxDsk = dsk;
      if (diasComRegistro.contains(dsk)) {
        b.diasComRegistro++;
        b.registros += registrosPorDia[dsk] ?? 0;
      }
    }
    final list = buckets.values.toList()
      ..sort((a, b) => b.key.compareTo(a.key));
    if (list.isEmpty) return _emptyNote('Sem dias úteis no filtro atual.');

    return TouchableList(
      rows: list.map((b) {
        final pct = b.diasUteis > 0
            ? (b.diasComRegistro / b.diasUteis * 100).round()
            : 0;
        final label = _gran == _Gran.semana
            ? 'Semana ${b.key.split('-W').last} · ${_fmtDataLabel(b.minDsk!)}–${_fmtDataLabel(b.maxDsk!)}'
            : () {
                final parts = b.key.split('-');
                return '${_meses[int.parse(parts[1]) - 1]} ${parts[0]}';
              }();
        return ListRowData(
          name: label,
          sub:
              '${b.diasComRegistro} de ${b.diasUteis} dias úteis · ${b.registros} registros',
          value: '$pct%',
          badgeText: pct >= 90 ? 'Em dia' : (pct >= 50 ? 'Atenção' : 'Baixa'),
          tone: _toneForPct(pct),
        );
      }).toList(),
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
