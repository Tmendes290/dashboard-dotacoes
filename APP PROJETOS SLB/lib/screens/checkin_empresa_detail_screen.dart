import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/section_label.dart';
import '../widgets/hero_card.dart';
import '../widgets/touchable_list.dart';

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

String _fmtDataLabel(String? dsk) {
  if (dsk == null || dsk.length < 10) return '—';
  return dsk.substring(0, 10).split('-').reversed.join('/');
}

/// Todos os registros de check-in de UMA empresa, no filtro (obra/squad/
/// período/turno) já aplicado na tela de Check-in — aberto ao tocar numa
/// linha do "Ranking de empresas".
class CheckinEmpresaDetailScreen extends StatelessWidget {
  final String empresa;
  final List<Map<String, dynamic>> registros;
  final int refMin;

  const CheckinEmpresaDetailScreen({
    super.key,
    required this.empresa,
    required this.registros,
    required this.refMin,
  });

  @override
  Widget build(BuildContext context) {
    final ordenados = [...registros]..sort(
      (a, b) => (b['data_sort_key']?.toString() ?? '').compareTo(
        a['data_sort_key']?.toString() ?? '',
      ),
    );

    var noPrazo = 0;
    for (final d in registros) {
      final base = _baseOf(d);
      if (base != null && base <= refMin) noPrazo++;
    }
    final pct = registros.isNotEmpty
        ? (noPrazo / registros.length * 100).round()
        : 0;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.ink,
        foregroundColor: AppColors.headerText,
        title: Text(
          empresa,
          style: AppText.display(size: 18, color: AppColors.headerText),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
        children: [
          const SectionLabel(number: '01', title: 'Resumo'),
          HeroCard(
            label: 'Registros sem atraso',
            value: '$pct%',
            subtitle:
                '$noPrazo de ${registros.length} registros no prazo (Horário Ref. ${_fmtHora(refMin)})',
          ),
          const SizedBox(height: 20),
          SectionLabel(
            number: '02',
            title: 'Registros',
            trailing: '${registros.length} registros',
          ),
          if (ordenados.isEmpty)
            Text(
              'Nenhum registro no filtro atual.',
              style: AppText.body(size: 12, color: AppColors.muted),
            )
          else
            TouchableList(
              rows: ordenados.map((d) {
                final base = _baseOf(d);
                final atraso = base != null ? base - refMin : null;
                final atrasado = atraso != null && atraso > 0;
                final sap = d['sap']?.toString() ?? '—';
                final fiscal = (d['fiscal']?.toString() ?? '').trim();
                return ListRowData(
                  name: _fmtDataLabel(d['data_sort_key']?.toString()),
                  sub:
                      'Obra $sap · fiscal ${fiscal.isEmpty ? '—' : fiscal} · horário ${_fmtHora(base)}',
                  value: atrasado ? '+${atraso}min' : 'No prazo',
                  badgeText: atrasado ? 'Atraso' : 'No prazo',
                  tone: atrasado ? StatusTone.warn : StatusTone.ok,
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}
