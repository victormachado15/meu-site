const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { load } = require('cheerio');

const PCI_MCP = 'https://mcp.pciconcursos.com.br/mcp';
const PCI_HOST = 'www.pciconcursos.com.br';
const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const bancas = [
    { nome: 'FCC (Fundação Carlos Chagas)', padrao: /\b(?:concursosfcc|fundação carlos chagas|fcc)\b/i },
    { nome: 'VUNESP', padrao: /\bvunesp\b/i },
    { nome: 'Avança SP', padrao: /\bavan[cç]a\s*sp\b/i },
    { nome: 'CEBRASPE', padrao: /\bcebraspe\b/i },
    { nome: 'FGV', padrao: /\b(?:fgv|fundação getulio vargas)\b/i },
    { nome: 'INDEPAC', padrao: /\bindepac\b/i }
];

function urlNoticia(valor) {
    try {
        const url = new URL(valor);
        if (url.protocol !== 'https:' || url.hostname !== PCI_HOST || url.port || url.username || url.password ||
            !/^\/noticias\/[a-z0-9-]+\/?$/.test(url.pathname)) return null;
        return `https://${PCI_HOST}${url.pathname.replace(/\/$/, '')}`;
    } catch {
        return null;
    }
}

function dataIso(dia, mes, ano) {
    const data = new Date(Date.UTC(Number(ano), mes - 1, Number(dia)));
    if (data.getUTCFullYear() !== Number(ano) || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== Number(dia)) return '';
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function datasInscricao(datas) {
    function dataValida(valor) {
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return '';
        const [ano, mes, dia] = valor.split('-');
        return dataIso(dia, Number(mes), ano) === valor ? valor : '';
    }
    const inicioInscricao = dataValida(datas?.inicio);
    const fimInscricao = dataValida(datas?.fim);
    if (inicioInscricao && fimInscricao && inicioInscricao > fimInscricao) {
        return { inicioInscricao: '', fimInscricao: '' };
    }
    return { inicioInscricao, fimInscricao };
}

function extrairDados(html) {
    const $ = load(html);
    const corpo = $('[itemprop="articleBody"]').first();
    if (!corpo.length || !$('article#noticia h1').first().text().trim()) {
        throw new Error('A página não contém uma notícia reconhecida da PCI.');
    }
    const paragrafos = corpo.find('p').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get();
    const datas = new Set();
    const bancasEncontradas = new Set();
    for (const paragrafo of paragrafos) {
        if (/\b(?:inscriç(?:ão|ões)|banca|organizadora)\b/i.test(paragrafo)) {
            for (const banca of bancas) if (banca.padrao.test(paragrafo)) bancasEncontradas.add(banca.nome);
        }
        for (const frase of paragrafo.split(/(?<=[.!?])\s+/)) {
            const contexto = /\bprovas?\b[^.;!?]{0,80}\b(?:previst[ao]s?|realizad[ao]s?|aplicad[ao]s?|ocorrer[áa]|acontecer[áa])\b/i.exec(frase);
            if (!contexto) continue;
            const padrao = /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/gi;
            for (const match of frase.matchAll(padrao)) {
                const intervalo = frase.slice(contexto.index + contexto[0].length, match.index);
                if (match.index < contexto.index + contexto[0].length || intervalo.length > 80 ||
                    /\b(?:inscriç(?:ão|ões)|resultado|gabarito|recurso)\b/i.test(intervalo)) continue;
                const data = match[1]
                    ? dataIso(match[1], meses.indexOf(match[2].toLocaleLowerCase('pt-BR')) + 1, match[3])
                    : dataIso(match[4], Number(match[5]), match[6]);
                if (data) datas.add(data);
            }
        }
    }
    return {
        nome: $('article#noticia h1').first().text().trim(),
        banca: bancasEncontradas.size === 1 ? [...bancasEncontradas][0] : '',
        dataProva: datas.size === 1 ? [...datas][0] : ''
    };
}

async function consultar(url, options = {}) {
    const resposta = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!resposta.ok) throw new Error(`A PCI respondeu com erro ${resposta.status}.`);
    const texto = await resposta.text();
    if (texto.length > 2000000) throw new Error('A resposta da PCI é grande demais.');
    return texto;
}

async function carregarNoticia(link, nome) {
    const url = urlNoticia(link);
    if (!url) throw new Error('Use um link de notícia da PCI Concursos.');
    const dados = extrairDados(await consultar(url));
    return { ...dados, nome: nome || dados.nome, link: url };
}

async function pesquisar(termo) {
    const entrada = termo.trim();
    if (!entrada || entrada.length > 255) throw new Error('Informe um nome ou link de até 255 caracteres.');
    if (/^https?:\/\//i.test(entrada)) return [await carregarNoticia(entrada)];
    if (/^(?:www\.|[^ ]+\.[a-z]{2,}\/)/i.test(entrada)) throw new Error('Para pesquisar por link, use uma URL https de notícia da PCI.');
    const payload = {
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: 'pesquisar_concursos', arguments: { termo: entrada } }
    };
    const resposta = JSON.parse(await consultar(PCI_MCP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(payload)
    }));
    if (resposta.error || resposta.result?.isError) throw new Error('A pesquisa da PCI retornou um erro.');
    const conteudo = resposta.result?.content?.find(item => item.type === 'text')?.text;
    if (!conteudo) throw new Error('A pesquisa da PCI retornou uma resposta inesperada.');
    const resultado = JSON.parse(conteudo);
    if (resultado.errors?.length) throw new Error(`A PCI recusou a pesquisa: ${resultado.errors.join('; ')}`);
    if (!Array.isArray(resultado.data)) throw new Error('Não foi possível interpretar os resultados da PCI.');
    return Promise.all(resultado.data.slice(0, 8).map(async item => {
        const link = urlNoticia(item.noticia?.link);
        if (!link || typeof item.titulo !== 'string') throw new Error('A PCI retornou um concurso sem notícia válida.');
        const inscricoes = datasInscricao(item.datas);
        try {
            return { ...await carregarNoticia(link, item.titulo), ...inscricoes };
        } catch (erro) {
            console.error('Erro ao consultar notícia da PCI:', erro);
            return { nome: item.titulo, banca: '', dataProva: '', link, ...inscricoes, aviso: 'Não foi possível ler os detalhes da notícia.' };
        }
    }));
}

function criarServidor() {
    return http.createServer(async (req, res) => {
        const origemPermitida = process.env.ORIGEM_SITE;
        if (origemPermitida && req.headers.origin === origemPermitida) {
            res.setHeader('Access-Control-Allow-Origin', origemPermitida);
            res.setHeader('Vary', 'Origin');
        }
        const url = new URL(req.url, 'http://localhost');
        if (req.method === 'GET' && url.pathname === '/api/concursos') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            try {
                const termo = url.searchParams.get('q') || '';
                if (!termo.trim() || termo.length > 255) {
                    res.writeHead(400).end(JSON.stringify({ erro: 'Informe um nome ou link de até 255 caracteres.' }));
                    return;
                }
                const resultados = await pesquisar(termo);
                res.end(JSON.stringify({ resultados }));
            } catch (erro) {
                console.error('Erro na pesquisa:', erro);
                res.writeHead(502).end(JSON.stringify({ erro: erro.message }));
            }
            return;
        }
        if (req.method === 'GET' && ['/', '/concursos', '/concursos/', '/concursos/index.html'].includes(url.pathname)) {
            try {
                const pagina = await fs.readFile(path.join(__dirname, 'index.html'));
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(pagina);
            } catch (erro) {
                console.error('Erro ao carregar a página:', erro);
                res.writeHead(500).end('Não foi possível carregar a página.');
            }
            return;
        }
        res.writeHead(404).end('Não encontrado.');
    });
}

if (require.main === module) {
    const porta = Number(process.env.PORT || 3000);
    criarServidor().listen(porta, () => console.log(`Concursos disponível na porta ${porta}`));
}

module.exports = { criarServidor, extrairDados, urlNoticia, datasInscricao };
