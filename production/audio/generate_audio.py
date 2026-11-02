"""Original restrained procedural score and UI SFX. No samples or external audio assets.
Synthesis methods reuse only the established NumPy envelope/filter/mix approach.
"""
from pathlib import Path
import json, math, shutil, subprocess, wave
import numpy as np

SR = 32000
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RAW = HERE / 'raw'
OUT = ROOT / 'assets' / 'audio'
RAW.mkdir(parents=True, exist_ok=True)
(OUT / 'music').mkdir(parents=True, exist_ok=True)
(OUT / 'sfx').mkdir(parents=True, exist_ok=True)
FFMPEG = shutil.which('ffmpeg') or r'C:\ffmpeg\bin\ffmpeg.exe'


def time(dur):
    return np.arange(int(dur * SR), dtype=np.float64) / SR


def sine(freq, dur, decay=None):
    t = time(dur)
    x = np.sin(2 * np.pi * freq * t)
    if decay:
        x *= np.exp(-t / decay)
    return x


def lowpass(x, alpha=0.08):
    out = np.empty_like(x)
    acc = 0.0
    for i, value in enumerate(x):
        acc += alpha * (value - acc)
        out[i] = acc
    return out


def noise(dur, seed):
    return np.random.default_rng(seed).uniform(-1, 1, int(dur * SR))


def norm(x, peak=0.65):
    x = np.asarray(x, dtype=np.float64)
    return x / max(1e-9, float(np.max(np.abs(x)))) * peak


def stereo(x, width=0.08):
    # Subtle decorrelation, not a dramatic cinematic effect.
    delayed = np.roll(x, 37)
    return np.column_stack((x * (1 - width) + delayed * width, x * (1 - width) - delayed * width))


def pluck(freq, dur=2.8):
    t = time(dur)
    env = (1 - np.exp(-t / 0.008)) * np.exp(-t / 0.72)
    body = np.sin(2 * np.pi * freq * t) + 0.24 * np.sin(2 * np.pi * freq * 2.01 * t) + 0.08 * np.sin(2 * np.pi * freq * 3.98 * t)
    return body * env


def music(theme, seed):
    dur = 32.0
    t = time(dur)
    rng = np.random.default_rng(seed)
    root = {'menu': 73.416, 'day': 73.416, 'night': 65.406, 'ending': 73.416}[theme]
    drone = np.sin(2 * np.pi * root * t) * 0.24 + np.sin(2 * np.pi * root * 1.5 * t) * 0.07
    air = lowpass(noise(dur, seed), 0.012) * (0.12 if theme != 'night' else 0.17)
    score = drone + air
    # 'Seven Days Unfinished': seven notes; the seventh (C, a whole step under the D tonic) is left unresolved.
    motif = [146.832, 174.614, 220.0, 164.814, 146.832, 130.813, 130.813 * 0.9439]
    starts = [2.0, 6.0, 10.0, 14.5, 19.0, 23.5, 27.0]
    gains = {'menu': 0.16, 'day': 0.13, 'night': 0.08, 'ending': 0.18}[theme]
    for index, (start, freq) in enumerate(zip(starts, motif)):
        if theme == 'night' and index % 2:
            continue
        note = pluck(freq * (0.5 if theme == 'night' else 1), 3.8)
        gain = gains * (0.85 + rng.random() * 0.2)
        i = int(start * SR)
        score[i:i + len(note)] += note[:len(score) - i] * gain
    if theme == 'day':
        pulse = np.sin(2 * np.pi * 49 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * t)) ** 8 * 0.055
        score += pulse
    if theme == 'night':
        score += np.sin(2 * np.pi * 49 * t) * 0.08
    if theme == 'ending':
        for start, freq in [(4.0, 293.665), (12.0, 349.228), (20.0, 440.0), (27.0, 329.628)]:
            note = pluck(freq, 4.0) * 0.055
            i = int(start * SR)
            score[i:i + len(note)] += note[:len(score) - i]
    fade = np.minimum(np.clip(t / 0.3, 0, 1), np.clip((dur - t) / 0.45, 0, 1))
    return norm(stereo(score * fade), 0.72)


def sfx(name):
    if name == 'select':
        x = pluck(440, 0.12) * 0.4
    elif name == 'issue':
        t = time(0.34); x = lowpass(noise(0.34, 11), 0.18) * np.exp(-t / 0.07) + sine(110, 0.34, 0.09) * 0.35
    elif name == 'invalid':
        t = time(0.25); x = (sine(155, 0.25) + sine(146, 0.25) * 0.6) * np.exp(-t / 0.08)
    elif name == 'round':
        t = time(0.65); x = pluck(220, 0.65) * 0.5 + pluck(293.665, 0.65) * 0.22
    elif name == 'delayed':
        t = time(0.8); x = pluck(196, 0.8) * 0.42 + np.roll(pluck(146.832, 0.8), int(0.14 * SR)) * 0.3
    elif name == 'alert':
        t = time(0.7); x = sine(98, 0.7, 0.25) * 0.6 + lowpass(noise(0.7, 17), 0.04) * np.exp(-t / 0.22)
    elif name == 'collapse':
        t = time(1.5); x = sine(65.406, 1.5, 0.42) * 0.8 + sine(61.735, 1.5, 0.5) * 0.3 + lowpass(noise(1.5, 23), 0.025) * np.exp(-t / 0.3)
    elif name == 'ending':
        x = pluck(220, 1.8) * 0.4 + pluck(293.665, 1.8) * 0.25 + pluck(349.228, 1.8) * 0.15
    elif name == 'menu':
        t = time(0.16); x = highpass_simple(noise(0.16, 29)) * np.exp(-t / 0.028) + pluck(520, 0.16) * 0.12
    elif name == 'phone':
        # Two short desk-phone purrs (not an alarm): 2 x 0.18 s with a gap.
        t = time(0.18); ring = (sine(420, 0.18) + sine(480, 0.18) * 0.7) * np.minimum(1, t / 0.01) * np.exp(-t / 0.12)
        x = np.concatenate((ring, np.zeros(int(0.09 * SR)), ring * 0.8)) * 0.5
    elif name == 'file':
        t = time(0.3); x = lowpass(noise(0.3, 41), 0.32) * np.exp(-t / 0.05) * 0.8 + lowpass(noise(0.3, 43), 0.08) * np.exp(-((t - 0.12) ** 2) / 0.002) * 0.5
    elif name == 'receive':
        t = time(0.42); x = pluck(293.665, 0.42) * 0.35 + np.roll(pluck(440.0, 0.42), int(0.08 * SR)) * 0.25
    elif name == 'blocked':
        t = time(0.5); x = (sine(196, 0.5) * 0.5 + sine(207.65, 0.5) * 0.3) * np.exp(-t / 0.12) + lowpass(noise(0.5, 47), 0.05) * np.exp(-t / 0.05) * 0.3
    elif name == 'complete':
        t = time(0.6); x = pluck(220, 0.6) * 0.32 + np.roll(pluck(293.665, 0.6), int(0.07 * SR)) * 0.3
    elif name == 'dayturn':
        # One 7/8 bar at 168 bpm (eighth = 0.179 s), grouped 2+2+3; accents on 1, 3, 5.
        eighth = 60 / 168 / 2
        x = np.zeros(int(eighth * 7 * SR + 0.4 * SR))
        for step in range(7):
            accent = step in (0, 2, 4)
            tick = lowpass(noise(0.05, 50 + step), 0.4) * np.exp(-time(0.05) / 0.01) * (0.6 if accent else 0.28)
            if accent:
                tick = tick + pluck(146.832 if step == 0 else 220.0, 0.05) * 0.25
            i = int(step * eighth * SR)
            x[i:i + len(tick)] += tick
    elif name == 'archive':
        t = time(0.7); x = lowpass(noise(0.7, 53), 0.2) * np.exp(-t / 0.09) * 0.6 + sine(98, 0.7, 0.2) * 0.4
    elif name == 'ending_costly':
        # Held at the unresolved seventh: no return to the tonic.
        x = pluck(220, 2.0) * 0.32 + np.roll(pluck(164.814, 2.0), int(0.35 * SR)) * 0.28 + np.roll(pluck(130.813 * 0.9439, 2.0), int(0.7 * SR)) * 0.3
    else:  # modal
        t = time(0.28); x = lowpass(noise(0.28, 31), 0.12) * np.exp(-t / 0.055) + pluck(260, 0.28) * 0.15
    return norm(x, 0.52)


def highpass_simple(x):
    return x - lowpass(x, 0.08)


def write_wav(path, data):
    data = norm(data, 0.8) if data.ndim == 1 else np.clip(data, -1, 1)
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(1 if pcm.ndim == 1 else pcm.shape[1])
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())


def encode(source, target, music_track):
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(source), '-af', 'loudnorm=I=-24:TP=-4:LRA=7', '-c:a', 'libvorbis', '-q:a', '3' if music_track else '2', str(target)], check=True)


manifest = []
for index, theme in enumerate(('menu', 'day', 'night', 'ending')):
    data = music(theme, 20261110 + index)
    source = RAW / (theme + '.wav')
    target = OUT / 'music' / (theme + '.ogg')
    write_wav(source, data); encode(source, target, True)
    manifest.append({'id': 'music.' + theme, 'source': 'production/audio/raw/' + source.name, 'output': 'assets/audio/music/' + target.name, 'seconds': 32, 'bytes': target.stat().st_size, 'method': 'original NumPy procedural synthesis; D-minor motif; stereo; Ogg Vorbis q3; loudnorm -24 LUFS'})
    print('music', theme, target.stat().st_size)
for name in ('select', 'issue', 'invalid', 'round', 'delayed', 'alert', 'collapse', 'ending', 'menu', 'modal', 'phone', 'file', 'receive', 'blocked', 'complete', 'dayturn', 'archive', 'ending_costly'):
    data = sfx(name)
    source = RAW / (name + '.wav')
    target = OUT / 'sfx' / (name + '.ogg')
    write_wav(source, data); encode(source, target, False)
    manifest.append({'id': 'sfx.' + name, 'source': 'production/audio/raw/' + source.name, 'output': 'assets/audio/sfx/' + target.name, 'seconds': round(len(data) / SR, 3), 'bytes': target.stat().st_size, 'method': 'original NumPy procedural synthesis; mono; Ogg Vorbis q2; restrained -24 LUFS'})
    print('sfx', name, target.stat().st_size)
(HERE / 'audio-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('AUDIO_DONE', len(manifest))
