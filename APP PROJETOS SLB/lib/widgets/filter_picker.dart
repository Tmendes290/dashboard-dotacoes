import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Botão compacto ("PEP: 2 selecionados ▾") que abre uma busca com seleção
/// múltipla — usado quando a lista de opções é longa demais pra caber em
/// chips na tela. Conjunto vazio = "Todos" (sem filtro).
class FilterPickerChip extends StatelessWidget {
  final String label;
  final Set<String> selected;
  final List<String> options;
  final ValueChanged<Set<String>> onChanged;

  const FilterPickerChip({
    super.key,
    required this.label,
    required this.selected,
    required this.options,
    required this.onChanged,
  });

  String get _valueLabel {
    if (selected.isEmpty) return 'Todos';
    if (selected.length == 1) return selected.first;
    return '${selected.length} selecionados';
  }

  @override
  Widget build(BuildContext context) {
    final isSet = selected.isNotEmpty;
    return GestureDetector(
      onTap: () async {
        final result = await showModalBottomSheet<Set<String>>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) => _FilterSheet(
            title: label,
            options: options,
            initialSelected: selected,
          ),
        );
        if (result != null) onChanged(result);
      },
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
              '$label: ',
              style: AppText.body(
                size: 12,
                color: isSet ? Colors.white70 : AppColors.steel,
                w: FontWeight.w600,
              ),
            ),
            Flexible(
              child: Text(
                _valueLabel,
                style: AppText.body(
                  size: 12,
                  color: isSet ? Colors.white : AppColors.ink2,
                  w: FontWeight.w700,
                ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.expand_more,
              size: 16,
              color: isSet ? Colors.white70 : AppColors.muted,
            ),
          ],
        ),
      ),
    );
  }
}

/// Linha horizontal rolável de [FilterPickerChip]s.
class FilterPickerRow extends StatelessWidget {
  final List<Widget> children;
  const FilterPickerRow({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final c in children)
            Padding(padding: const EdgeInsets.only(right: 8), child: c),
        ],
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  final String title;
  final List<String> options;
  final Set<String> initialSelected;
  const _FilterSheet({
    required this.title,
    required this.options,
    required this.initialSelected,
  });

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

// Acima desse número de resultados numa busca, mostra o atalho "selecionar
// todos" — marcar um a um deixa de valer a pena.
const _selectAllThreshold = 10;

class _FilterSheetState extends State<_FilterSheet> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  late Set<String> _selected;

  @override
  void initState() {
    super.initState();
    _selected = {...widget.initialSelected};
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _query.isEmpty
        ? widget.options
        : widget.options
              .where((o) => o.toLowerCase().contains(_query))
              .toList();
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.paper,
            borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.title.toUpperCase(),
                        style: AppText.display(size: 18, color: AppColors.ink),
                      ),
                    ),
                    if (_selected.isNotEmpty)
                      TextButton(
                        onPressed: () => setState(() => _selected.clear()),
                        child: Text(
                          'Limpar',
                          style: AppText.body(
                            size: 12,
                            color: AppColors.copperDeep,
                            w: FontWeight.w600,
                          ),
                        ),
                      ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (v) =>
                      setState(() => _query = v.trim().toLowerCase()),
                  style: AppText.body(size: 14),
                  decoration: InputDecoration(
                    hintText: 'Digite pra buscar…',
                    hintStyle: AppText.body(size: 13, color: AppColors.muted),
                    prefixIcon: const Icon(
                      Icons.search,
                      size: 20,
                      color: AppColors.muted,
                    ),
                    filled: true,
                    fillColor: AppColors.card,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
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
              ),
              if (_query.isNotEmpty && filtered.length > _selectAllThreshold)
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () =>
                          setState(() => _selected.addAll(filtered)),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      icon: const Icon(Icons.done_all, size: 16),
                      label: Text(
                        'Selecionar todos os ${filtered.length} resultados da busca',
                        style: AppText.body(
                          size: 12.5,
                          color: AppColors.copperDeep,
                          w: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 4),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                  itemCount: filtered.length,
                  itemBuilder: (context, i) {
                    final opt = filtered[i];
                    final checked = _selected.contains(opt);
                    return CheckboxListTile(
                      value: checked,
                      onChanged: (v) => setState(
                        () => v == true
                            ? _selected.add(opt)
                            : _selected.remove(opt),
                      ),
                      title: Text(
                        opt,
                        style: AppText.body(
                          size: 14,
                          color: AppColors.ink,
                          w: checked ? FontWeight.w700 : FontWeight.w400,
                        ),
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                      activeColor: AppColors.copper,
                      dense: true,
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 18),
                child: SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(_selected),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.copper,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: Text(
                      _selected.isEmpty
                          ? 'Mostrar todos'
                          : 'Aplicar (${_selected.length})',
                      style: AppText.body(
                        size: 14,
                        color: Colors.white,
                        w: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
