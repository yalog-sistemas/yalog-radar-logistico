# Execução individual por NF

A execução alterna entre cargas e notas fiscais, com busca por número e filtro de status. Apenas documentos fiscais efetivamente vinculados no faturamento recebem atualizações; números de pedido não são tratados como NF.

Cada evento registra NF, status, destino da carga associado à nota, ocorrência, horário efetivo, horário do servidor e usuário. Não há migração automática das antigas baixas de carga para notas. Nesses casos a interface identifica explicitamente a referência histórica.

A carga consolida as entregas confirmadas: uma parte entregue resulta em ENTREGA PARCIAL; a conclusão exige todas as NFs entregues. Insucesso é tentativa e não entrega concluída. Horários de conclusão são removidos do consolidado se uma nota voltar a pendente, preservando os eventos históricos. O prazo usa a previsão da carga e a data efetiva em Brasília.

MASTER, GESTOR e EXECUTOR podem registrar eventos. A TRANSPORTADORA só atualiza cargas faturadas atribuídas ao seu vínculo ativo; VISUALIZADOR não grava. A função `radar_atualizar_entrega_nf` verifica sessão, empresa, vínculo, documento, destino e versão, e altera somente a execução da carga selecionada. Funções auxiliares ficam no schema privado. A API pública é intencionalmente acessível ao cliente anon, mas exige token válido da sessão do módulo em toda chamada.

O mapa mantém a referência por cidade/UF e agrupa as notas por ponto explicitamente associado ou inferido do XML. Verde indica todas as notas associadas entregues; âmbar, parte entregue; azul, ponto pendente ou sem associação. A posição do caminhão usa coordenadas informadas ou capturadas com consentimento pelo navegador, com local, horário e autor. Não há GPS contínuo ou rastreamento em tempo real. Relatório do motorista e Excel distinguem dados individuais e histórico de carga.

Validação: testes SQL transacionais com rollback cobrem isolamento, visualizador, sessão inválida, NF alheia, concorrência, parcial, atraso, tentativa e preservação de outra carga. Testes DOM verificam filtros, seleção da nota, gravação, mapa e impressão. O XLSX é gerado e reaberto para conferir status individual, origem do status e ocorrência.
