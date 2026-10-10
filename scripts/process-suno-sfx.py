"""Recorta, normaliza e codifica a sonoplastia gerada no Suno.

Uso: python scripts/process-suno-sfx.py   (ou: npm run assets:sfx)

Falas: cada arquivo traz várias frases em sequência. A identidade e a ordem de
cada frase vieram da transcrição (whisper); aqui só se definem fronteiras
aproximadas, que são refinadas para o ponto de menor energia por perto.

Efeitos: começam no início do arquivo; recorta-se a duração útil e aplica-se
fade-out, porque o Suno devolveu texturas longas em vez de estalos curtos.
"""
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
# Originais do Suno ficam fora do Git, em tmp/ (vão para o backup do Drive).
BASE = RAIZ / 'tmp' / 'audio-source' / 'suno-sonoplastia'
RAW = BASE / 'raw'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / 'public' / 'assets' / 'audio' / 'sfx'
SR_ANALISE = 48000
JANELA = 0.01  # 10 ms


def envelope(path: Path) -> list[float]:
    n = int(SR_ANALISE * JANELA)
    err = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af',
         f'aformat=channel_layouts=mono,asetnsamples={n}:p=0,astats=metadata=1:reset=1,'
         'ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-'],
        capture_output=True, text=True).stderr
    return [(-120.0 if v == '-inf' else float(v))
            for v in re.findall(r'RMS_level=(-?[\d.]+|-inf)', err)]


def refinar(env: list[float], t: float, raio: float = 0.3) -> float:
    """Fronteira interna -> frame mais silencioso dentro de +-raio."""
    a = max(0, int((t - raio) / JANELA))
    b = min(len(env) - 1, int((t + raio) / JANELA))
    if a >= b:
        return t
    i = min(range(a, b + 1), key=lambda k: env[k])
    return i * JANELA


def aparar(env: list[float], ini: float, fim: float, limiar_rel: float = 32) -> tuple[float, float]:
    """Corta as bordas silenciosas do trecho, com folga para ataque e cauda."""
    a, b = int(ini / JANELA), min(len(env), int(fim / JANELA))
    trecho = env[a:b]
    if not trecho:
        return ini, fim
    limiar = max(trecho) - limiar_rel
    vivos = [k for k, v in enumerate(trecho) if v > limiar]
    if not vivos:
        return ini, fim
    s = ini + vivos[0] * JANELA - 0.02
    e = ini + (vivos[-1] + 1) * JANELA + 0.07
    return max(ini, s), min(fim, e)


def pico_db(path: Path) -> float:
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'volumedetect',
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.search(r'max_volume: (-?[\d.]+) dB', err)
    return float(m.group(1)) if m else 0.0


def exportar(trechos: list[tuple[Path, float, float]], destino: str, fade_out: float, voz: bool) -> float:
    """trechos: [(arquivo, ini, fim)] emendados em ordem (normalmente um só)."""
    tmp = BASE / 'tmp_proc.wav'
    filtros = []
    entradas = []
    for k, (arq, ini, fim) in enumerate(trechos):
        entradas += ['-i', str(arq)]
        filtros.append(f'[{k}:a]atrim=start={ini:.3f}:end={fim:.3f},asetpts=PTS-STARTPTS,'
                       f'aformat=channel_layouts=mono:sample_rates=44100[p{k}]')
    junta = ''.join(f'[p{k}]' for k in range(len(trechos)))
    dur = sum(f - i for _, i, f in trechos)
    cadeia = f'{junta}concat=n={len(trechos)}:v=0:a=1[c];[c]'
    if voz:
        cadeia += 'highpass=f=90,'
    cadeia += f'afade=t=in:d=0.004,afade=t=out:st={max(0.0, dur - fade_out):.3f}:d={fade_out:.3f}[o]'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *entradas,
                    '-filter_complex', ';'.join(filtros) + ';' + cadeia, '-map', '[o]', str(tmp)], check=True)
    ganho = -1.0 - pico_db(tmp)  # pico em -1 dBFS
    alvo = OUT / destino
    alvo.parent.mkdir(parents=True, exist_ok=True)
    comum = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(tmp), '-af', f'volume={ganho:.2f}dB',
             '-ac', '1', '-ar', '44100']
    subprocess.run([*comum, '-c:a', 'libvorbis', '-q:a', '3', str(alvo) + '.ogg'], check=True)
    subprocess.run([*comum, '-c:a', 'libmp3lame', '-b:a', '96k', str(alvo) + '.mp3'], check=True)
    tmp.unlink()
    return dur


# ---- falas: arquivo -> (fronteiras aproximadas, nomes) -------------------------
# Fronteira 0 e a última ficam fixas; as internas são refinadas.
FALAS = {
    'locutor': ([0.0, 1.75, 3.75, 5.73, 7.22, 8.70, 9.76, 10.89, 12.48, 14.0, 16.5, 20.4],
                ['round-1', 'round-2', 'round-3', 'round-4', 'round-5', 'fight', 'ko', 'tempo',
                 'empate', 'finalize', 'vitoria'], 'locutor'),
    'rafa': ([0.0, 1.8, 4.0, 6.4], ['mao-da-mare', 'eco-tatuado', 'chute-da-ressaca'], 'vozes/rafa'),
    'noir': ([0.0, 1.9, 4.0, 6.5], ['reflexo-negro', 'quebra-luz', 'impacto-solar'], 'vozes/noir'),
    'astro': ([0.0, 2.3, 5.2, 8.0], ['sorriso-relampago', 'rajada-neon', 'astro-giro'], 'vozes/astro'),
    'leo': ([0.0, 2.1, 5.8, 10.6], ['olhar-frio', 'impacto-sombrio', 'pressao-violeta'], 'vozes/leo'),
    'guto': ([0.0, 2.15, 6.0, 10.5], ['muralha-norte', 'gancho-do-urso', 'abraco-glacial'], 'vozes/guto'),
}

# ---- efeitos: arquivo -> (destino, duração útil, fade-out) --------------------
EFEITOS = {
    'swing': ('combate/golpe-ar', 0.85, 0.35),
    'hit': ('combate/soco-leve', 0.75, 0.4),
    'hitHeavy': ('combate/soco-forte', 0.95, 0.5),
    'block': ('combate/bloqueio', 0.7, 0.35),
    'ko': ('combate/ko-impacto', 2.6, 1.6),
    'agua': ('especiais/agua', 1.4, 0.8),
    'gelo': ('especiais/gelo', 1.6, 0.9),
    'espelho': ('especiais/espelho', 1.4, 0.8),
    'neon': ('especiais/neon', 1.2, 0.7),
    'fumaca': ('especiais/fumaca', 1.3, 0.75),
    'sombra': ('especiais/sombra', 1.6, 0.9),
    'chuteRessaca': ('especiais/super-chute-da-ressaca', 2.2, 1.2),
    'impactoSolar': ('especiais/super-impacto-solar', 2.4, 1.3),
    'astroGiro': ('especiais/super-astro-giro', 3.2, 1.2),
    'pontoFinal': ('especiais/super-ponto-final', 2.4, 1.3),
    'pressaoVioleta': ('especiais/super-pressao-violeta', 2.4, 1.3),
    'abracoGlacial': ('especiais/super-abraco-glacial', 2.4, 1.3),
    'monstro': ('finalizacao/monstro-rugido', 4.6, 2.2),
}


def main() -> None:
    relatorio = []
    for nome, (bordas, rotulos, pasta) in FALAS.items():
        arq = RAW / f'{nome}.wav'
        env = envelope(arq)
        b = [bordas[0]] + [refinar(env, t) for t in bordas[1:-1]] + [bordas[-1]]
        for k, rotulo in enumerate(rotulos):
            ini, fim = aparar(env, b[k], b[k + 1])
            dur = exportar([(arq, ini, fim)], f'{pasta}/{rotulo}', 0.05, voz=True)
            relatorio.append(f'{pasta}/{rotulo:20} {ini:6.2f}-{fim:6.2f}  ({dur:.2f}s)')

    # O locutor ri antes do "Vitória"; a transcrição confirmou a palavra
    # inteira a partir de 18,66 s (em 19,0 s sobra só "-tória").
    arq = RAW / 'locutor.wav'
    ini, fim = aparar(envelope(arq), 18.66, 20.40)
    dur = exportar([(arq, max(18.64, ini), fim)], 'locutor/vitoria', 0.06, voz=True)
    relatorio.append(f'locutor/vitoria (sem o riso)      {max(18.64, ini):6.2f}-{fim:6.2f}  ({dur:.2f}s)')

    # Dante: "Chave ... Binária" veio com 1,8 s de pausa entre as palavras.
    arq = RAW / 'dante.wav'
    env = envelope(arq)
    bomba = aparar(env, 0.0, refinar(env, 2.4))
    chave = aparar(env, refinar(env, 2.4), refinar(env, 5.0))
    binaria = aparar(env, refinar(env, 5.0), refinar(env, 7.1))
    ponto = aparar(env, refinar(env, 7.1), 10.8)
    for rotulo, partes in (('bomba-de-fumaca', [bomba]), ('chave-binaria', [chave, binaria]),
                           ('ponto-final', [ponto])):
        dur = exportar([(arq, i, f) for i, f in partes], f'vozes/dante/{rotulo}', 0.05, voz=True)
        relatorio.append(f'vozes/dante/{rotulo:20} {" + ".join(f"{i:.2f}-{f:.2f}" for i, f in partes)}  ({dur:.2f}s)')

    for nome, (destino, util, fade) in EFEITOS.items():
        arq = RAW / f'{nome}.wav'
        env = envelope(arq)
        limiar = max(env) - 30
        inicio = next((k * JANELA for k, v in enumerate(env) if v > limiar), 0.0)
        inicio = max(0.0, inicio - 0.01)
        dur = exportar([(arq, inicio, inicio + util)], destino, fade, voz=False)
        relatorio.append(f'{destino:34} {inicio:6.2f}-{inicio + util:6.2f}  ({dur:.2f}s)')

    print('\n'.join(relatorio))


if __name__ == '__main__':
    main()
