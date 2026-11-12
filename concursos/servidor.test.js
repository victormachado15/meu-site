const test = require('node:test');
const assert = require('node:assert/strict');
const { criarServidor, extrairDados, urlNoticia, datasInscricao } = require('./servidor');

function noticia(paragrafos) {
    return `<article id="noticia"><h1>Concurso Exemplo</h1><div itemprop="articleBody">${paragrafos}</div></article>`;
}

test('identifica banca e data de prova sem confundir com inscrições', () => {
    const dados = extrairDados(noticia(`
        <p>As inscrições serão realizadas no site da VUNESP de 12 de novembro de 2026 a 14 de dezembro de 2026.</p>
        <p>As provas estão previstas para 21 de fevereiro de 2027.</p>
    `));
    assert.deepEqual(dados, { nome: 'Concurso Exemplo', banca: 'VUNESP', dataProva: '2027-02-21' });
});

test('não inventa data ou banca quando houver ambiguidade ou só data de inscrição', () => {
    const dados = extrairDados(noticia(`
        <p>As inscrições acontecem nos sites da VUNESP e da FGV.</p>
        <p>As provas serão realizadas após as inscrições em 12/11/2026.</p>
    `));
    assert.equal(dados.banca, '');
    assert.equal(dados.dataProva, '');
    const varias = extrairDados(noticia('<p>As provas serão aplicadas em 21/02/2027 e 28/02/2027.</p>'));
    assert.equal(varias.dataProva, '');
});

test('aceita apenas links de notícias da PCI, sem destinos internos ou terceiros', () => {
    assert.equal(urlNoticia('https://www.pciconcursos.com.br/noticias/exemplo?x=1'), 'https://www.pciconcursos.com.br/noticias/exemplo');
    for (const link of ['http://www.pciconcursos.com.br/noticias/exemplo', 'https://www.pciconcursos.com.br.evil.test/noticias/exemplo', 'https://127.0.0.1/noticias/exemplo', 'https://www.pciconcursos.com.br/concursos/']) {
        assert.equal(urlNoticia(link), null);
    }
});

test('preserva apenas datas de inscrição válidas e em ordem', () => {
    assert.deepEqual(datasInscricao({ inicio: '2026-11-12', fim: '2026-12-14' }), {
        inicioInscricao: '2026-11-12', fimInscricao: '2026-12-14'
    });
    assert.deepEqual(datasInscricao({ inicio: '2026-12-14', fim: '2026-11-12' }), {
        inicioInscricao: '', fimInscricao: ''
    });
    assert.deepEqual(datasInscricao({ inicio: '2026-02-30', fim: '2026-12-14' }), {
        inicioInscricao: '', fimInscricao: '2026-12-14'
    });
});

test('API retorna resultados, não resultados e falhas de detalhes sem inventar dados', async () => {
    const fetchOriginal = global.fetch;
    const servidor = criarServidor();
    global.fetch = async (url, options) => {
        if (url === 'https://mcp.pciconcursos.com.br/mcp') {
            const termo = JSON.parse(options.body).params.arguments.termo;
            const dados = termo === 'inexistente' ? [] : [{
                titulo: 'CETESB',
                datas: { inicio: '2026-11-12', fim: '2026-12-14' },
                noticia: { link: `https://www.pciconcursos.com.br/noticias/${termo === 'falha' ? 'falha' : 'cetesb'}` }
            }];
            return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify({ data: dados, errors: [] }) }] } }));
        }
        if (url === 'https://www.pciconcursos.com.br/noticias/cetesb') {
            return new Response(noticia('<p>Inscrições no site da FCC.</p><p>As provas estão previstas para 21 de fevereiro de 2027.</p>'));
        }
        throw new Error('Fonte indisponível');
    };
    await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${servidor.address().port}/api/concursos?q=`;
    try {
        const encontrado = await (await fetchOriginal(base + 'CETESB')).json();
        assert.deepEqual(encontrado.resultados[0], {
            nome: 'CETESB', banca: 'FCC (Fundação Carlos Chagas)', dataProva: '2027-02-21',
            link: 'https://www.pciconcursos.com.br/noticias/cetesb',
            inicioInscricao: '2026-11-12', fimInscricao: '2026-12-14'
        });
        const vazio = await (await fetchOriginal(base + 'inexistente')).json();
        assert.deepEqual(vazio.resultados, []);
        const direto = await (await fetchOriginal(base + encodeURIComponent('https://www.pciconcursos.com.br/noticias/cetesb'))).json();
        assert.equal(direto.resultados[0].nome, 'Concurso Exemplo');
        const falha = await (await fetchOriginal(base + 'falha')).json();
        assert.equal(falha.resultados[0].dataProva, '');
        assert.equal(falha.resultados[0].banca, '');
        assert.equal(falha.resultados[0].inicioInscricao, '2026-11-12');
        assert.match(falha.resultados[0].aviso, /Não foi possível/);
        const invalido = await fetchOriginal(base + encodeURIComponent('https://127.0.0.1/noticias/x'));
        assert.equal(invalido.status, 502);
    } finally {
        global.fetch = fetchOriginal;
        await new Promise(resolve => servidor.close(resolve));
    }
});
