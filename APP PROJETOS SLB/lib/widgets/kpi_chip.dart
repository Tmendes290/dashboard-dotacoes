import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class KpiChipData {
  final String label;
  final String value;
  final String? prefix;
  final String note;
  final StatusTone? tone;
  final VoidCallback? onTap;
  const KpiChipData({
    required this.label,
    required this.value,
    this.prefix,
    required this.note,
    this.tone,
    this.onTap,
  });
}

class KpiChipsRow extends StatelessWidget {
  final List<KpiChipData> chips;
  const KpiChipsRow({super.key, required this.chips});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 84,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: chips.length,
        separatorBuilder: (context, i) => const SizedBox(width: 10),
        itemBuilder: (context, i) => _KpiChip(data: chips[i]),
      ),
    );
  }
}

class _KpiChip extends StatelessWidget {
  final KpiChipData data;
  const _KpiChip({required this.data});

  @override
  Widget build(BuildContext context) {
    final barColor = data.tone != null
        ? StatusColors.bar(data.tone!)
        : AppColors.steel;
    final noteColor = data.tone != null
        ? StatusColors.fg(data.tone!)
        : AppColors.ink2;
    final card = Container(
      width: 168,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Stack(
        children: [
          Positioned(
            left: -13,
            top: 0,
            bottom: 0,
            child: Container(
              width: 3,
              decoration: BoxDecoration(
                color: barColor,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(left: 9),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  data.label.toUpperCase(),
                  style: AppText.body(
                    size: 9.5,
                    color: AppColors.steel,
                    w: FontWeight.w600,
                  ).copyWith(letterSpacing: 0.4),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Text(
                  '${data.prefix != null ? '${data.prefix} ' : ''}${data.value}',
                  style: AppText.mono(size: 15, color: AppColors.ink),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  data.note,
                  style: AppText.body(
                    size: 10,
                    color: noteColor,
                    w: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
    if (data.onTap == null) return card;
    return InkWell(
      onTap: data.onTap,
      borderRadius: BorderRadius.circular(12),
      child: card,
    );
  }
}
