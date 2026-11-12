# Meus Concursos

Os concursos continuam salvos no `localStorage` do navegador, separado por origem (endereço e porta): acessar a página em outro endereço não transfere automaticamente a lista existente. A busca usa o serviço oficial MCP da PCI Concursos para localizar até oito concursos com inscrições abertas ou prestes a abrir e consulta a notícia da PCI para tentar identificar banca e data de prova. O resultado deve ser conferido no edital: dados não identificados ou ambíguos ficam em branco. Links de notícias da PCI também podem ser pesquisados diretamente; para outros links, use o cadastro manual.

O exemplo CETESB 2026 é incluído uma única vez nas listas existentes, sem substituir outros concursos. A prova prevista é em 21/02/2027; as inscrições começam em 12/11/2026. A página oficial da banca é informada no cadastro inicial.

Na coluna **Situação**, clique no indicador para editar o período de inscrições ou escolher uma situação manual. No modo automático, as inscrições ficam próximas antes do início, abertas entre as datas (inclusive) e encerradas depois do fim; após a data prevista da prova, aparece “Prova realizada”. Essa última indicação é baseada apenas na data prevista: confirme se houve alteração no edital. Quando faltam dados suficientes, a situação fica como não informada. Uma situação manual tem prioridade e não muda automaticamente. A busca por nome traz as datas de inscrições disponibilizadas pela PCI; a busca por link pode exigir preenchimento manual. Dados salvos não são atualizados automaticamente pela PCI.

Os períodos cadastrados para CRECI-SP, Prefeitura de Limeira, TRT-8 e TRF-3 foram consultados em 11/11/2026 na PCI Concursos: [CRECI-SP](https://www.pciconcursos.com.br/noticias/creci-sp-anuncia-concurso-publico-com-salarios-de-ate-9940), [Limeira](https://www.pciconcursos.com.br/noticias/prefeitura-de-limeira-sp-prorroga-inscricoes-de-concursos-com-vagas-em-diversas-areas), [TRT-8](https://www.pciconcursos.com.br/noticias/trt-8-pa-ap-publica-edital-de-concurso-para-tecnicos-e-analistas-judiciarios) e [TRF-3](https://www.pciconcursos.com.br/noticias/trf3-sp-ms-retifica-concurso-publico-para-analistas-e-tecnicos-judiciarios). Nas listas existentes, esses períodos só são preenchidos para os concursos e datas de prova correspondentes, quando ainda não há datas nem situação manual.

## Executar

Requer Node.js 20.16 ou superior:

```powershell
cd concursos
npm install
npm start
```

Abra `http://localhost:3000/concursos/`. Execute `npm test` na mesma pasta para testar o serviço.

## Publicação

A busca precisa do serviço Node disponível: uma hospedagem somente estática, como GitHub Pages, não consegue executar `servidor.js`. Publique a pasta `concursos` em um serviço Node que execute `npm start` e forneça a variável `PORT`. A página servida pelo próprio Node usa a API na mesma origem.

Se mantiver a página em uma hospedagem estática separada, configure o endereço HTTPS do serviço no atributo `content` da meta `concursos-api` em `index.html` e defina `ORIGEM_SITE` no serviço com a origem exata da página, por exemplo `https://usuario.github.io` (sem barra final). Publique ambos novamente. Sem o serviço publicado e configurado, apenas o cadastro manual funciona.
