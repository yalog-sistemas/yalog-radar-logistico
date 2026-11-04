# Filtro e relatório de Performance

O seletor da página oferece Todas as transportadoras ou uma transportadora ativa específica. Cards e tabela usam a mesma seleção. A página considera a base operacional disponível (sem filtro de período) e exclui cargas canceladas; seu filtro é independente dos filtros dos dashboards.

No perfil TRANSPORTADORA, o vínculo autenticado define o único parceiro disponível, o seletor fica bloqueado e a seleção enviada pela interface não altera o vínculo. O carregamento do servidor continua restringindo os dados da transportadora.

Imprimir / salvar relatório abre um documento A4 em paisagem com identificação da empresa, seleção, usuário emissor, data/hora, oito indicadores, tabela de performance, faróis e legenda. Não inclui menus nem a lista de opções de outras transportadoras. O navegador permite imprimir ou salvar como PDF; não há envio automático para terceiros. O rodapé institucional YALOG permanece no relatório.

Os cálculos não foram alterados: eficiência geral usa cargas no denominador; eficiência na tabela usa entregas concluídas; SLA da tabela usa entregas concluídas sem status de atraso. Esses critérios também constam na impressão para contextualizar os resultados.

Verificação: seleção geral/individual, atualização simultânea de cards e tabela, exclusão de canceladas, isolamento da transportadora na seleção e impressão, dados operacionais preservados e conteúdo seguro do relatório.

## Análise por carga e NF e exportação Excel
A mesma seleção alimenta uma lista de cargas com notas fiscais vinculadas, status operacional, situação de prazo, previsão e entrega/tentativa efetiva. Números de pedidos não são tratados como notas fiscais. A origem das NFs segue documentos_fiscais e a compatibilidade de faturamento já existente. As notas não têm baixa individual: status e prazo da carga são apresentados como referência.

Baixar Excel gera XLSX nativo com três abas: Resumo (indicadores e comparação das transportadoras), Cargas (uma linha por carga) e Notas fiscais (uma linha por NF vinculada à carga). Os cabeçalhos ficam congelados, as listas possuem filtros, percentuais/quantidades são numéricos, datas são próprias do Excel e identificadores permanecem como texto, preservando zeros. Datas não registradas ficam vazias. Hora efetiva e emissão do arquivo usam Brasília. O arquivo representa a seleção no momento do clique, mesmo se o filtro mudar durante a geração.

A impressão também inclui a análise detalhada. A exportação é local no navegador, usando ExcelJS 4.4.0 (licença MIT em vendor/EXCELJS-LICENSE.txt), carregado da distribuição oficial em jsDelivr somente quando solicitado, com versão fixa e verificação de integridade SHA-384. Não envia dados para terceiros.

Testes: XLSX real gerado e reaberto com a biblioteca de navegador, contagem de cargas e NFs sem duplicar o resumo, filtros/cabeçalhos, zeros à esquerda, datas e hora de Brasília, texto não interpretado como fórmula, informações ausentes sem invenção, exclusão de canceladas, permissão de transportadora e escopo preservado durante o download.
