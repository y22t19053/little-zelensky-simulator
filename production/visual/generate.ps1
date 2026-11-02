# Reuses the existing local ComfyUI client; it does not reimplement generation.
$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$python = 'C:\Users\11ee11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$client = 'C:\Users\11ee11\Documents\deepseek-harness\default-workspace\_research\coc-game\coc_iso3d\tools\comfy_gen.py'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out = Join-Path $PSScriptRoot 'raw'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$style = 'independent strategy game editorial illustration, political archive cut paper collage, screen print on coarse recycled paper, angular cinematic composition, charcoal olive gray and desaturated amber only, flat carved shapes, restrained contrast, no gradients, no glow, no words, no letters, no numbers, no logos, no flags, no watermark, no photorealism'
$negative = 'text, letters, words, numbers, logo, flag, watermark, glossy 3d, neon, sci-fi hud, radar, glowing gradients, cute, caricature, celebrity portrait, gore, bodies, detailed military insignia'
$jobs = @(
  @{id='invasion'; seed=20261102; prompt='presidential office before dawn, heavy desk with black telephone and unsigned folders, tall window, incoming crisis conveyed by overlapping abstract papers and angular direction marks, solitary empty chair, tense stillness'},
  @{id='location'; seed=20261103; prompt='empty presidential chair between a public microphone and a secure underground doorway, two pools of hard flat light, exposed location versus continuity, political symbolism, no person'},
  @{id='hostomel'; seed=20261104; prompt='contested airport runway in oblique perspective, damaged hangar and empty aircraft apron, dark smoke cut from paper, broken runway markings without numbers, no troops, no aircraft count, uncertain control'},
  @{id='capital-night'; seed=20261105; prompt='capital city at night under curfew, abstract Kyiv roofline and domes, sandbag checkpoint and anti tank hedgehogs, one amber street lamp, quiet streets, no soldiers, no exact landmarks'},
  @{id='two-fronts'; seed=20261106; prompt='war room table with three overlapping abstract theater diagrams pulling at one small stack of reserve tokens, compass-like torn paper arrows, scarce fuel and ammunition boxes, strategic triage, no real map'},
  @{id='diplomacy'; seed=20261107; prompt='diplomatic archive desk at night, unsigned application papers, telephone receiver, sealed envelopes and parallel communication channels, two desk lamps, no readable text, no flags, no institutional logos'},
  @{id='seventh-night'; seed=20261108; prompt='night freight railway logistics, abstract train wagons and converging tracks, plain supply crates, fuel can and medical parcel with simple geometric marks, coordinated government logistics, no real route, no readable labels'}
)
$manifest = @()
foreach ($job in $jobs) {
  $target = Join-Path $out ($job.id + '.png')
  $prompt = $job.prompt + ', ' + $style
  Write-Output "GENERATE $($job.id)"
  & $python $client --model sdxl --size 1152x640 --steps 25 --seed $job.seed --prompt $prompt --negative $negative --out $target --timeout 480
  if ($LASTEXITCODE -ne 0) { throw "Generation failed: $($job.id)" }
  $manifest += [pscustomobject]@{id=$job.id; seed=$job.seed; model='sd_xl_base_1.0.safetensors'; steps=25; cfg=7; sampler='euler'; scheduler='normal'; size='1152x640'; prompt=$prompt; negative=$negative; raw='raw/' + $job.id + '.png'}
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'generation-manifest.json') -Encoding utf8
& $python (Join-Path $PSScriptRoot 'postprocess.py')
if ($LASTEXITCODE -ne 0) { throw 'Visual postprocess failed' }
& $python (Join-Path $PSScriptRoot 'generate_vectors.py')
if ($LASTEXITCODE -ne 0) { throw 'Vector generation failed' }
Write-Output 'VISUAL_BATCH_DONE'
