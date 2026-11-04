# Roteirização rodoviária do Radar
A janela de mapa está disponível em Pré-visualizar carga → Pré-visualizar rota, nas propostas de Formação automática → Rota e em Carga → Mapa e sequência de entregas.

- O cálculo inicia automaticamente ao abrir a janela.
- A opção Primeira entrega permite fixar a primeira localidade. O restante da sequência é recalculado.
- As setas permitem mudar toda a ordem manualmente, recalculando os trechos.
- Aplicar sequência mantém o planejamento; salve/confirme a carga para gravar. Em uma carga já salva, Aplicar sequência grava a alteração diretamente.
- O mapa, as distâncias de cada trecho, o total e os links do Google Maps refletem a mesma ordem selecionada.
- Para itinerários longos, os links por trechos respeitam os limites do Google Maps no celular.
- Visualizadores podem consultar; não podem aplicar nem gravar alterações.

## Critério e limites
O objetivo é minimizar a soma das distâncias da matriz rodoviária consultada, partindo da origem e terminando na última entrega, sem voltar à origem. Até 12 localidades, a ordem é calculada por programação dinâmica; de 13 a 25, utiliza aproximação com melhorias locais. Os trechos seguem o perfil de direção disponibilizado pelo OSRM, sem garantia de menor distância absoluta em todas as vias existentes.

Os pedidos atuais fornecem cidade/UF. Pedidos na mesma cidade são agrupados; não há roteirização porta a porta nem diferenciação de clientes na mesma cidade por endereço. O cálculo não considera trânsito em tempo real, pedágios, janelas de entrega ou restrições de caminhões. O Google Maps pode sugerir vias diferentes.

Mapa: Leaflet 1.9.4 / OpenStreetMap. Trajetos e matriz: serviço público OSRM. Localização de cidades não incluídas no catálogo: serviço público Photon, validando cidade, estado e Brasil. Esses serviços públicos não têm garantia de disponibilidade; uma falha não gera quilômetros inventados nem bloqueia o cadastro normal de cargas.

A sequência é armazenada nos pedidos da carga e em route_stops. Distâncias, trechos, origem, base cidade/UF e data ficam em road_route, na persistência existente por empresa. Alterações de origem ou destino invalidam a referência anterior.

## Verificação
Testes cobrem minimização em matriz assimétrica, primeira entrega fixa, destinos sem conexão, agrupamento sem perda de pedidos, rotas maiores, alteração de origem, perfil de consulta, preservação dos acessos e integração com formação manual/automática. Uma consulta real de Uberaba → Ribeirão Preto → Campinas confirmou os trechos e a soma de 394,1 km no serviço rodoviário em 04/11/2026; o valor é uma estimativa entre os pontos de referência urbanos utilizados.

## Cotação, execução e roteiro do motorista (v078)
- Formação automática: cada proposta oferece Pré-visualizar rota, usando o mesmo mapa e controle de sequência da formação manual.
- Cotação de Frete e Status de Fretes: botão de rota por carga. Execução / Entregas: Ver / imprimir rota.
- Imprimir roteiro do motorista abre uma versão A4 com mapa, sequência, clientes, pedidos, produtos, pesos, volumes e quilômetros por trecho/acumulados; não inclui preços. Uma sequência ainda não salva é identificada como prévia.
- Rotas gravadas podem ser abertas sem recalcular os quilômetros. Serviços cartográficos indisponíveis não impedem consultar o trajeto já armazenado; a impressão usa um esquema quando o mapa não está disponível.
- Transportadoras autenticadas e vinculadas recebem somente cargas disponibilizadas a elas e suas próprias cotações. Podem revisar a sequência dessas cargas pelo serviço exclusivo de rota; não podem gravar a base completa, ver preços de concorrentes ou alterar cargas encerradas/canceladas. As alterações registram usuário e data e ficam visíveis para a embarcadora.
- Controle de versão impede sobrescrever uma atualização concorrente. Em caso de conflito, reabra a rota.
- Testes adicionais: formação automática, impressão de rota salva e prévia, perfil de transportadora, gravação restrita, cargas encerradas, isolamento entre transportadoras, preservação de documentos/preços e conflitos de versão.
