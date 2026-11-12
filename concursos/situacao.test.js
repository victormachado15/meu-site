const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('cheerio');

function carregarPagina(valores = {}) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const $ = load(html);
    const script = $('script').filter((_, elemento) => !$(elemento).attr('src')).last().html()
        .replace(/(\/\/ Inicializar aplicação\s*)renderizarTabela\(\);/, '$1');
    const elementos = new Map();
    const contexto = vm.createContext({
        localStorage: {
            getItem(chave) {
                if (Object.hasOwn(valores, chave)) return valores[chave];
                return chave === 'meus_concursos_v3' ? '[]' : 'true';
            },
            setItem(chave, valor) { valores[chave] = valor; }
        },
        document: {
            getElementById(id) {
                if (!elementos.has(id)) elementos.set(id, {
                    classList: { add() {}, remove() {} },
                    addEventListener() {},
                    innerHTML: ''
                });

                return elementos.get(id);
            }
        },
        setTimeout() {},
        console
    });
    vm.runInContext(script, contexto);
    return contexto;
}

test('situação automática acompanha os limites das inscrições e da prova', () => {
    const pagina = carregarPagina();
    const concurso = {
        inicioInscricao: '2026-11-12', fimInscricao: '2026-12-14', dataProva: '2027-02-21'
    };
    for (const [dia, esperado] of [
        ['2026-11-11', 'inscricoes-proximas'],
        ['2026-11-12', 'inscricoes-abertas'],
        ['2026-12-14', 'inscricoes-abertas'],
        ['2026-12-15', 'inscricoes-encerradas'],
        ['2027-02-21', 'inscricoes-encerradas'],
        ['2027-02-22', 'prova-realizada']
    ]) assert.equal(pagina.obterSituacao(concurso, dia), esperado);
});

test('situação manual prevalece e dados insuficientes não inventam situação', () => {
    const pagina = carregarPagina();
    assert.equal(pagina.obterSituacao({ situacaoManual: 'aguardando-edital', dataProva: '2026-10-11' }, '2026-11-11'), 'aguardando-edital');
    assert.equal(pagina.obterSituacao({ inicioInscricao: '2026-11-12' }, '2026-11-13'), 'nao-informada');
    assert.equal(pagina.obterSituacao({}, '2026-11-11'), 'nao-informada');
    assert.equal(pagina.validarInscricoes('2026-12-15', '2026-12-14'), false);
});

test('migração preenche apenas concursos existentes correspondentes sem substituir escolhas', () => {
    const valores = {
        meus_concursos_inscricoes_2026_v1: null,
        meus_concursos_v3: JSON.stringify([
            { id: 1, nome: 'CRECI-SP (Superior)', dataProva: '2026-11-29' },
            { id: 2, nome: 'Prefeitura de Limeira', dataProva: '2026-12-06' },
            { id: 3, nome: 'TRT 8ª Região', dataProva: '2027-01-17' },
            { id: 4, nome: 'TRF 3ª Região', dataProva: '2027-01-31' },
            { id: 5, nome: 'CRECI-SP (Superior)', dataProva: '2028-01-01' },
            { id: 6, nome: 'TRF 3ª Região', dataProva: '2027-01-31', situacaoManual: 'aguardando-edital' },
            { id: 7, nome: 'TRT 8ª Região', dataProva: '2027-01-17', fimInscricao: '2026-12-01' }
        ])
    };
    const pagina = carregarPagina(valores);
    const concursos = JSON.parse(valores.meus_concursos_v3);
    assert.deepEqual(concursos.slice(0, 4).map(c => [c.inicioInscricao, c.fimInscricao]), [
        ['2026-08-21', '2026-09-21'], ['2026-07-31', '2026-09-21'],
        ['2026-10-05', '2026-11-05'], ['2026-11-04', '2026-11-23']
    ]);
    assert.equal(pagina.obterSituacao(concursos[0], '2026-11-11'), 'inscricoes-encerradas');
    assert.equal(pagina.obterSituacao(concursos[1], '2026-11-11'), 'inscricoes-encerradas');
    assert.equal(pagina.obterSituacao(concursos[2], '2026-11-11'), 'inscricoes-encerradas');
    assert.equal(pagina.obterSituacao(concursos[3], '2026-11-11'), 'inscricoes-abertas');
    assert.equal(concursos[4].inicioInscricao, undefined);
    assert.equal(concursos[5].situacaoManual, 'aguardando-edital');
    assert.equal(concursos[5].inicioInscricao, undefined);
    assert.equal(concursos[6].fimInscricao, '2026-12-01');
    assert.equal(concursos[6].inicioInscricao, undefined);
});
