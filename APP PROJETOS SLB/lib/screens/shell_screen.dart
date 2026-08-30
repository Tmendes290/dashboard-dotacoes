import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'home_screen.dart';
import 'produtividade_screen.dart';
import 'cji3_screen.dart';
import 'materiais_screen.dart';
import 'perfil_screen.dart';

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;
  // Só a aba 0 (Início) é montada de cara. As outras só entram na árvore
  // (e disparam suas buscas no Supabase) na primeira vez que o usuário toca
  // nelas — antes, as 5 abas buscavam tudo em paralelo no login e cada uma
  // ficava mais lenta disputando rede com as outras.
  final Set<int> _visited = {0};
  bool _sidebarOpen = true;

  void _goToTab(int i) => setState(() {
    _index = i;
    _visited.add(i);
  });

  late final _screens = [
    HomeScreen(onNavigateToTab: _goToTab),
    const ProdutividadeScreen(),
    const Cji3Screen(),
    const MateriaisScreen(),
    const PerfilScreen(),
  ];

  static const _items = [
    (icon: Icons.home_outlined, activeIcon: Icons.home, label: 'Início'),
    (
      icon: Icons.trending_up_outlined,
      activeIcon: Icons.trending_up,
      label: 'Produtividade',
    ),
    (
      icon: Icons.fact_check_outlined,
      activeIcon: Icons.fact_check,
      label: 'CJI3',
    ),
    (
      icon: Icons.inventory_2_outlined,
      activeIcon: Icons.inventory_2,
      label: 'Materiais',
    ),
    (icon: Icons.person_outline, activeIcon: Icons.person, label: 'Perfil'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: _sidebarOpen ? 82 : 26,
              decoration: const BoxDecoration(
                color: AppColors.card,
                border: Border(right: BorderSide(color: AppColors.line)),
              ),
              child: _sidebarOpen ? _buildExpanded() : _buildCollapsed(),
            ),
            Expanded(
              child: IndexedStack(
                index: _index,
                children: List.generate(
                  _screens.length,
                  (i) =>
                      _visited.contains(i) ? _screens[i] : const SizedBox.shrink(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExpanded() {
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            onPressed: () => setState(() => _sidebarOpen = false),
            icon: const Icon(
              Icons.chevron_left,
              size: 20,
              color: AppColors.muted,
            ),
            tooltip: 'Ocultar menu',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            splashRadius: 16,
          ),
        ),
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: List.generate(_items.length, (i) => _sidebarItem(i)),
          ),
        ),
      ],
    );
  }

  Widget _buildCollapsed() {
    return InkWell(
      onTap: () => setState(() => _sidebarOpen = true),
      child: const SizedBox(
        width: double.infinity,
        height: double.infinity,
        child: Tooltip(
          message: 'Mostrar menu',
          child: Center(
            child: Icon(Icons.chevron_right, size: 16, color: AppColors.muted),
          ),
        ),
      ),
    );
  }

  Widget _sidebarItem(int i) {
    final item = _items[i];
    final active = i == _index;
    final color = active ? AppColors.copperDeep : AppColors.muted;
    return InkWell(
      onTap: () => _goToTab(i),
      child: Container(
        decoration: active
            ? BoxDecoration(
                border: Border(
                  left: BorderSide(color: AppColors.copper, width: 3),
                ),
              )
            : null,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
        child: Column(
          children: [
            Icon(
              active ? item.activeIcon : item.icon,
              size: 22,
              color: active ? AppColors.copper : color,
            ),
            const SizedBox(height: 4),
            Text(
              item.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: AppText.body(size: 9, color: color, w: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}
