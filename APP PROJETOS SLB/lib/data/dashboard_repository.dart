import 'package:supabase_flutter/supabase_flutter.dart';

/// Acessa as MESMAS tabelas Supabase que o Dashboard Dotações (index.html)
/// usa — nomes de tabela/coluna espelham exatamente `STATE.*` do site.
class DashboardRepository {
  final SupabaseClient _client = Supabase.instance.client;

  static const _pageSize = 1000;

  /// Supabase corta select() em 1000 linhas por padrão — pagina com .range()
  /// até esgotar, senão registros (PEPs, itens, etc.) somem silenciosamente
  /// em qualquer tabela que já tenha passado de 1000 linhas.
  ///
  /// A 1ª página já vem com o total (`count: exact`, mesma ida e volta), e as
  /// páginas seguintes são disparadas em paralelo em vez de uma esperar a
  /// outra — numa rede de obra com latência alta, uma tabela de 3 páginas
  /// sequenciais podia sozinha custar 3x o round-trip da rede.
  Future<List<Map<String, dynamic>>> _fetchAll(
    String table,
    String select, {
    String? orderBy,
    bool ascending = true,
  }) async {
    PostgrestTransformBuilder<PostgrestList> baseQuery() {
      final query = _client.from(table).select(select);
      return orderBy != null
          ? query.order(orderBy, ascending: ascending)
          : query;
    }

    final first = await baseQuery()
        .range(0, _pageSize - 1)
        .count(CountOption.exact);
    final all = List<Map<String, dynamic>>.from(first.data);
    if (all.length >= first.count) return all;

    final pending = <Future<List<Map<String, dynamic>>>>[];
    for (var offset = _pageSize; offset < first.count; offset += _pageSize) {
      pending.add(
        baseQuery()
            .range(offset, offset + _pageSize - 1)
            .then((rows) => (rows as List).cast<Map<String, dynamic>>()),
      );
    }
    for (final page in await Future.wait(pending)) {
      all.addAll(page);
    }
    return all;
  }

  /// pep -> {squad, lider, planejador} (tabela ref_squads).
  Future<Map<String, Map<String, String>>> fetchRefSquads() async {
    final rows = await _fetchAll('ref_squads', 'pep,squad,lider,planejador');
    final map = <String, Map<String, String>>{};
    for (final r in rows) {
      map[r['pep'] as String] = {
        'squad': (r['squad'] as String?) ?? '',
        'lider': (r['lider'] as String?) ?? '',
        'planejador': (r['planejador'] as String?) ?? '',
      };
    }
    return map;
  }

  /// Mesma lógica de getSquadInfo() do site: tenta o PEP exato, senão o
  /// prefixo antes do primeiro ponto (sub-PEP -> PEP pai).
  static String squadFor(
    Map<String, Map<String, String>> refSquads,
    String? pepOrSubPep,
  ) {
    if (pepOrSubPep == null || pepOrSubPep.isEmpty) return '';
    final direct = refSquads[pepOrSubPep];
    if (direct != null) return direct['squad'] ?? '';
    final pep = pepOrSubPep.split('.').first;
    return refSquads[pep]?['squad'] ?? '';
  }

  /// Tabela dotacoes.
  Future<List<Map<String, dynamic>>> fetchDotacoes() async {
    return _fetchAll('dotacoes', '*', orderBy: 'data_emissao');
  }

  /// Tabela capex (uma linha por PEP+grupo+empresa com capex/contratado/pago/etc).
  Future<List<Map<String, dynamic>>> fetchCapex() async {
    return _fetchAll('capex', '*');
  }

  /// Tabela ref_wbs: wbs (código do PEP) -> descricao (nome do projeto/PEP).
  /// Mesma fonte que alimenta getPepName() no site.
  Future<Map<String, String>> fetchRefWbs() async {
    final rows = await _fetchAll('ref_wbs', 'wbs,descricao');
    final map = <String, String>{};
    for (final r in rows) {
      final wbs = r['wbs'] as String?;
      if (wbs == null || wbs.isEmpty) continue;
      map[wbs] = (r['descricao'] as String?) ?? '';
    }
    return map;
  }

  /// Tabela capex_por_pep -> pep: valor.
  Future<Map<String, double>> fetchCapexPorPep() async {
    final rows = await _fetchAll('capex_por_pep', 'pep,valor');
    final map = <String, double>{};
    for (final r in rows) {
      map[r['pep'] as String] = (r['valor'] as num?)?.toDouble() ?? 0;
    }
    return map;
  }

  /// Tabela cji3_dados: uma única linha (chave='main') com o payload
  /// {rows:[{ger,site,proj,pname,wbs,wname,forn,v:{"2026-01":123.0,...}}], months:[...]}.
  Future<Map<String, dynamic>?> fetchCji3Payload() async {
    final row = await _client
        .from('cji3_dados')
        .select('payload')
        .eq('chave', 'main')
        .maybeSingle();
    if (row == null) return null;
    return row['payload'] as Map<String, dynamic>?;
  }

  /// Tabela materiais: cada linha guarda um objeto em `item` (jsonb).
  Future<List<Map<String, dynamic>>> fetchMateriais() async {
    final rows = await _fetchAll('materiais', 'item');
    return rows.map((r) => (r['item'] as Map).cast<String, dynamic>()).toList();
  }

  /// Versão leve de [fetchMateriais]: baixa só `situacao`/`prevEntrega` (via
  /// projeção jsonb no Postgres) em vez do `item` inteiro. Usada pela Home,
  /// que só precisa contar atrasos — não vale a pena repetir a busca pesada
  /// que a aba Materiais já faz com o item completo.
  Future<List<Map<String, dynamic>>> fetchMateriaisResumo() async {
    return _fetchAll(
      'materiais',
      'situacao:item->>situacao,prevEntrega:item->>prevEntrega',
    );
  }

  /// Tabela iprod_historico: um registro por comparativo salvo (squad,
  /// projeto, empresa, resultado com totCobrado/totRefAjust/pctImprod/linhas).
  Future<List<Map<String, dynamic>>> fetchIprodHistorico() async {
    return _fetchAll(
      'iprod_historico',
      'id,projeto,empresa,squad,praticabilidade,resultado,criado_em',
      orderBy: 'criado_em',
      ascending: false,
    );
  }

  /// Tabela improdutividade: um registro por apontamento de chegada/atraso
  /// importado da planilha (mesmos dados da aba "Produtividade Projetos
  /// Salobo" do site).
  Future<List<Map<String, dynamic>>> fetchImprodutividade() async {
    return _fetchAll(
      'improdutividade',
      'data_sort_key,empresa,sap,fiscal,chegada_min,pts_min,inicio_min,'
          'alm_ini_min,alm_fim_min,termino_min,acao',
      orderBy: 'data_sort_key',
    );
  }
}
