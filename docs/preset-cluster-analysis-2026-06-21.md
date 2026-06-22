# Preset Cluster Analysis

Generated: 2026-06-21T10:48:33.354Z

## Source

- Live Supabase V2 reads via `preset_summaries_v2`, `kessho_lookup_preset_rows_v2`, and `kessho_get_preset_payloads_v2`.
- Direct base-table reads were not used; the current project denies anonymous reads on `presets_v2`.
- Legacy preset rows were inspected for fallback coverage but excluded from clustering because V2 has current target-engine coverage.

## Method

- Similarity analysis is scoped per engine because parameter meanings differ between engines.
- Numeric payload fields are standardized within each engine. Time/frequency-like fields use log scaling before standardization.
- Discrete synthesis fields such as waveforms, algorithms, filter types, and routing modes are included as one-hot features.
- Existing human tags are excluded from deletion similarity, then lightly included for meta-group clustering and label inference.
- Meta groups use deterministic k-means with recurring tags weighted alongside sonic parameters.
- Distances are normalized Euclidean distances over the resulting feature vector; lower means more similar.

## Counts

| Engine | Count | Latest update |
| --- | ---: | --- |
| Synth / Pad (pad1) | 26 | 2026-06-12T11:45:55.366401+00:00 |
| Lead4opFM (lead4opfm) | 37 | 2026-06-11T21:48:28.615457+00:00 |
| Drum Sub (drumSub) | 29 | 2026-06-14T07:32:15.567331+00:00 |
| Drum Kick (drumKick) | 35 | 2026-06-14T07:32:18.900795+00:00 |
| Drum Click (drumClick) | 41 | 2026-06-14T07:32:24.067827+00:00 |
| Drum Beep Hi (drumBeepHi) | 46 | 2026-06-14T07:32:27.498355+00:00 |
| Drum Beep Lo (drumBeepLo) | 42 | 2026-06-14T07:32:30.352447+00:00 |
| Drum Noise (drumNoise) | 51 | 2026-06-14T07:32:34.145632+00:00 |
| Drum Membrane (drumMembrane) | 36 | 2026-06-14T07:32:38.656411+00:00 |

## Deletion Similarity Clusters

### Synth / Pad (pad1)

Threshold: 0.420. Pair distance p05/p10/median: 0.661 / 0.760 / 1.080.

Closest pairs:
- Muted Key <-> Soft Pluck (0.333)
- Metal Tine <-> Pluck Bell (0.462)
- Glass Marimba <-> Pluck Bell (0.494)
- Glass Marimba <-> Metal Tine (0.530)
- Poly Lead <-> Sync Lead (0.548)
- Soft Pluck <-> Warm Analog (0.554)
- Muted Key <-> Warm Analog (0.561)
- Folded Drift <-> Serge Swarm (0.586)

Candidate deletion clusters:
- Muted Key, Soft Pluck. Avg/max distance 0.333 / 0.333. Closest: Muted Key <-> Soft Pluck (0.333).

### Lead4opFM (lead4opfm)

Threshold: 0.420. Pair distance p05/p10/median: 0.646 / 0.750 / 1.136.

Closest pairs:
- Handpan <-> Tongue Drum (0.340)
- Cyber Mbira <-> Mbira (0.357)
- Kalimba <-> Marimba (0.382)
- Calliope <-> Reed Organ Lead (0.402)
- Plucked Ghost Harp <-> Wire Harp (0.448)
- Velvet FM Strings <-> VHS FM Pad (0.463)
- Amp Rotor Keys <-> Soft Rhodes (0.473)
- Celesta <-> Wire Harp (0.500)

Candidate deletion clusters:
- Handpan, Tongue Drum. Avg/max distance 0.340 / 0.340. Closest: Handpan <-> Tongue Drum (0.340).
- Cyber Mbira, Mbira. Avg/max distance 0.357 / 0.357. Closest: Cyber Mbira <-> Mbira (0.357).
- Kalimba, Marimba. Avg/max distance 0.382 / 0.382. Closest: Kalimba <-> Marimba (0.382).
- Calliope, Reed Organ Lead. Avg/max distance 0.402 / 0.402. Closest: Calliope <-> Reed Organ Lead (0.402).

### Drum Sub (drumSub)

Threshold: 0.420. Pair distance p05/p10/median: 0.584 / 0.763 / 1.343.

Closest pairs:
- Data Pulse Narrow <-> Zero Cross Thud (0.196)
- Data Pulse Narrow <-> Ikeda DC Blink (0.300)
- Deep Space <-> Tidal Pull (0.306)
- Data Pulse <-> Zero Cross Thud (0.360)
- 606 Blip Sub <-> Data Pulse Narrow (0.378)
- Classic Sub <-> Data Pulse (0.383)
- Distorted Pressure <-> Rumble (0.426)
- Data Pulse <-> Data Pulse Narrow (0.430)

Candidate deletion clusters:
- Data Pulse Narrow, Zero Cross Thud. Avg/max distance 0.196 / 0.196. Closest: Data Pulse Narrow <-> Zero Cross Thud (0.196).
- Deep Space, Tidal Pull. Avg/max distance 0.306 / 0.306. Closest: Deep Space <-> Tidal Pull (0.306).
- Classic Sub, Data Pulse. Avg/max distance 0.383 / 0.383. Closest: Classic Sub <-> Data Pulse (0.383).

### Drum Kick (drumKick)

Threshold: 0.420. Pair distance p05/p10/median: 0.565 / 0.661 / 1.353.

Closest pairs:
- Frame Drum <-> Stomped Earth (0.252)
- Detroit Snap Kick <-> Electro Knock Kick (0.257)
- Needle Kick <-> Zero Attack Kick (0.275)
- 909 Plastic Punch <-> Compact Club Kick (0.285)
- Broken DAC Kick <-> Gabber Micro Kick (0.334)
- Frame Drum <-> Heartbeat (0.341)
- Distant Thunder <-> Slow Bloom (0.346)
- 909 Plastic Punch <-> Detroit Snap Kick (0.348)

Candidate deletion clusters:
- Frame Drum, Stomped Earth. Avg/max distance 0.252 / 0.252. Closest: Frame Drum <-> Stomped Earth (0.252).
- Detroit Snap Kick, Electro Knock Kick. Avg/max distance 0.257 / 0.257. Closest: Detroit Snap Kick <-> Electro Knock Kick (0.257).
- Needle Kick, Zero Attack Kick. Avg/max distance 0.275 / 0.275. Closest: Needle Kick <-> Zero Attack Kick (0.275).
- 909 Plastic Punch, Compact Club Kick. Avg/max distance 0.285 / 0.285. Closest: 909 Plastic Punch <-> Compact Club Kick (0.285).
- Broken DAC Kick, Gabber Micro Kick. Avg/max distance 0.334 / 0.334. Closest: Broken DAC Kick <-> Gabber Micro Kick (0.334).
- Distant Thunder, Slow Bloom. Avg/max distance 0.346 / 0.346. Closest: Distant Thunder <-> Slow Bloom (0.346).

### Drum Click (drumClick)

Threshold: 0.420. Pair distance p05/p10/median: 0.662 / 0.794 / 1.177.

Closest pairs:
- Continuous Data Tone <-> Morse Dot (0.237)
- Micro Hit <-> Tick (0.368)
- Blip <-> Pop (0.390)
- Broken DAC Rim <-> Needle Rim (0.397)
- Cyber Clave <-> Rim Clave 808 (0.412)
- Pop <-> Raindrop (0.439)
- Data Point <-> Smooth Transient (0.440)
- Dewdrop <-> Raindrop (0.459)

Candidate deletion clusters:
- Continuous Data Tone, Morse Dot. Avg/max distance 0.237 / 0.237. Closest: Continuous Data Tone <-> Morse Dot (0.237).
- Micro Hit, Tick. Avg/max distance 0.368 / 0.368. Closest: Micro Hit <-> Tick (0.368).
- Blip, Pop. Avg/max distance 0.390 / 0.390. Closest: Blip <-> Pop (0.390).
- Broken DAC Rim, Needle Rim. Avg/max distance 0.397 / 0.397. Closest: Broken DAC Rim <-> Needle Rim (0.397).
- Cyber Clave, Rim Clave 808. Avg/max distance 0.412 / 0.412. Closest: Cyber Clave <-> Rim Clave 808 (0.412).

### Drum Beep Hi (drumBeepHi)

Threshold: 0.420. Pair distance p05/p10/median: 0.728 / 0.871 / 1.353.

Closest pairs:
- Chime <-> Wind Chime (0.277)
- 8k Lab Pin <-> Sine Microscope (0.284)
- Singing Bowl <-> Wind Chime (0.393)
- Bell <-> Glass (0.434)
- Frozen Bells <-> Glass (0.456)
- Phase Null Pip <-> Phase Shift Ping (0.460)
- Dry Lab Tone <-> Sine Microscope (0.465)
- Frozen Bells <-> Singing Bowl (0.466)

Candidate deletion clusters:
- Chime, Wind Chime. Avg/max distance 0.277 / 0.277. Closest: Chime <-> Wind Chime (0.277).
- 8k Lab Pin, Sine Microscope. Avg/max distance 0.284 / 0.284. Closest: 8k Lab Pin <-> Sine Microscope (0.284).

### Drum Beep Lo (drumBeepLo)

Threshold: 0.420. Pair distance p05/p10/median: 0.754 / 0.905 / 1.370.

Closest pairs:
- Low Carrier Pong <-> Tubby Data Tom (0.276)
- Kalimba <-> Pluck (0.317)
- Wood FM Tock <-> Woody (0.372)
- Bloop <-> Toybox Low Bleep (0.385)
- Hollow Echo <-> Underwater Ping (0.395)
- Modal Bell <-> Tensioned Wire Tom (0.500)
- Bloop <-> Low Carrier Pong (0.532)
- Digital Tabla <-> Hollow FM Tom (0.537)

Candidate deletion clusters:
- Low Carrier Pong, Tubby Data Tom. Avg/max distance 0.276 / 0.276. Closest: Low Carrier Pong <-> Tubby Data Tom (0.276).
- Kalimba, Pluck. Avg/max distance 0.317 / 0.317. Closest: Kalimba <-> Pluck (0.317).
- Wood FM Tock, Woody. Avg/max distance 0.372 / 0.372. Closest: Wood FM Tock <-> Woody (0.372).
- Bloop, Toybox Low Bleep. Avg/max distance 0.385 / 0.385. Closest: Bloop <-> Toybox Low Bleep (0.385).
- Hollow Echo, Underwater Ping. Avg/max distance 0.395 / 0.395. Closest: Hollow Echo <-> Underwater Ping (0.395).

### Drum Noise (drumNoise)

Threshold: 0.420. Pair distance p05/p10/median: 0.545 / 0.720 / 1.249.

Closest pairs:
- 808 Open Hat <-> 909 Open Hat (0.116)
- 808 Closed Hat <-> 909 Closed Hat (0.169)
- Comb Noise Tick <-> Notch Digital Hat (0.281)
- Distant Surf <-> Ocean Spray (0.285)
- 606 Paper Hat <-> 808 Closed Hat (0.287)
- 909 Clap Snap <-> Lab Clap 808 (0.292)
- Ocean Spray <-> Wind Gust (0.308)
- Forest Ambience <-> Texture (0.319)

Candidate deletion clusters:
- 808 Open Hat, 909 Open Hat, Bitcrushed Cymbal Spray. Avg/max distance 0.273 / 0.358. Closest: 808 Open Hat <-> 909 Open Hat (0.116).
- Comb Noise Tick, Notch Digital Hat. Avg/max distance 0.281 / 0.281. Closest: Comb Noise Tick <-> Notch Digital Hat (0.281).
- Distant Surf, Ocean Spray, Wind Gust. Avg/max distance 0.310 / 0.338. Closest: Distant Surf <-> Ocean Spray (0.285).
- 606 Paper Hat, 808 Closed Hat, 909 Closed Hat, Zipper Hat. Avg/max distance 0.313 / 0.397. Closest: 808 Closed Hat <-> 909 Closed Hat (0.169).
- Forest Ambience, Texture. Avg/max distance 0.319 / 0.319. Closest: Forest Ambience <-> Texture (0.319).
- Hi-Hat, Hiss. Avg/max distance 0.321 / 0.321. Closest: Hi-Hat <-> Hiss (0.321).
- 808 Clap, 909 Clap Snap, Lab Clap 808. Avg/max distance 0.374 / 0.416. Closest: 909 Clap Snap <-> Lab Clap 808 (0.292).
- Rain Patter, Sand Shuffle. Avg/max distance 0.378 / 0.378. Closest: Rain Patter <-> Sand Shuffle (0.378).

### Drum Membrane (drumMembrane)

Threshold: 0.420. Pair distance p05/p10/median: 0.571 / 0.693 / 1.127.

Closest pairs:
- Tuned Skin Tom High <-> Tuned Skin Tom Mid (0.235)
- 909 Snare Plastic <-> Tight Marching 2 (0.302)
- Djembe <-> High Tom (0.312)
- Tuned Skin Tom Low <-> Tuned Skin Tom Mid (0.322)
- Marching Snare <-> Tight Snare (0.337)
- Glass Bowl <-> Singing Bowl (0.397)
- Floor Tom <-> Tuned Skin Tom Low (0.439)
- High Tom <-> Plastic Bucket (0.450)

Candidate deletion clusters:
- Tuned Skin Tom High, Tuned Skin Tom Mid. Avg/max distance 0.235 / 0.235. Closest: Tuned Skin Tom High <-> Tuned Skin Tom Mid (0.235).
- 909 Snare Plastic, Tight Marching 2. Avg/max distance 0.302 / 0.302. Closest: 909 Snare Plastic <-> Tight Marching 2 (0.302).
- Djembe, High Tom. Avg/max distance 0.312 / 0.312. Closest: Djembe <-> High Tom (0.312).
- Marching Snare, Tight Snare. Avg/max distance 0.337 / 0.337. Closest: Marching Snare <-> Tight Snare (0.337).
- Glass Bowl, Singing Bowl. Avg/max distance 0.397 / 0.397. Closest: Glass Bowl <-> Singing Bowl (0.397).

## Meta Tagging Groups

### Synth / Pad (pad1)

- Group 1: pluck, bright, keys, aggressive, driven, percussive (13)
  Members: Breath, Buchla Pluck (Custom), Buchla Test, Glass Marimba, Glass Shimmer, Metal Tine, Muted Key, Pluck Bell, Poly Lead, Serge Stab, Sine Fold Key, Soft Pluck, Sync Lead
- Group 2: acid, aggressive, basic, cold, slow-attack, long-release (5)
  Members: Acid Stab, Digital Ice, Harsh Pluck, Init, Saturated Drift
- Group 3: evolving, fold, pad, ambient, slow-attack, long-decay, long-release (4)
  Members: Cathedral Organ, Folded Drift, Harmonic Bloom, Serge Swarm
- Group 4: deep, sub, analog, bass, slow-attack, long-release (3)
  Members: Deep Sub Drone, Sub Pluck, Warm Analog
- Group 5: buchla, floating, fold, percussive, fast-attack, short-release (1)
  Members: Buchla Pluck

### Lead4opFM (lead4opfm)

- Group 1: amp-lfo, brass, keys, lead, long-decay, bright (12)
  Members: Alloy Bass Bell, Amp Rotor Keys, Brass FM Swell, Calliope, Cyber Mbira, Electric Piano, Handpan, Mbira, Reed Organ Lead, Shimmering Pluck Cloud, Soft Rhodes, Tongue Drum
- Group 2: ambient, cinematic, drone, fixedhz, slow-attack, long-decay, long-release (12)
  Members: Aurora FM Pad, Blooming Bell Pad, Digital Waterphone, Fixed Star Drone, Frozen Formant Pad, Glass Choir Pad, Ice Cathedral Pad, Nocturne Digital Pad, Singing Bowl, Spectral Shimmer, VHS FM Pad, Velvet FM Strings
- Group 3: ambient, harp, pluck, fast-attack, long-decay, bright, percussive (9)
  Members: Celesta, Glockenspiel, Kalimba, Marimba, Operator Rain, Plucked Ghost Harp, Vibraphone, Wire Harp, Xylophone
- Group 4: fast-attack, long-decay, long-release, bright, percussive (2)
  Members: Church Bell, Deep Space Bell
- Group 5: fast-attack, long-decay, bright, percussive (1)
  Members: Gamelan
- Group 6: fast-attack, long-decay, short-release, percussive (1)
  Members: Hand Drum

### Drum Sub (drumSub)

- Group 1: ambient, deep, distorted, analog, long-decay, low, driven (8)
  Members: Deep Thump, Distorted Pressure, Dub Plate Sub, Pressure Wave, Rumble, Subterranean, Warehouse Rumble, Warm Pulse
- Group 2: bass, 808, analog, electro, fast-attack, long-decay, low (5)
  Members: 808 Long Boom, 808 Short Drop, Electro Clipped Sub, Rubber Sub Drop, TESt
- Group 3: organic, ambient, deep, natural, fast-attack, long-decay, low (5)
  Members: Deep Space, Earth Rumble, Heartbeat Pulse, Tidal Pull, Wooden Resonance
- Group 4: minimal, pure, 606, analog, long-decay, low (4)
  Members: 606 Blip Sub, Classic Sub, Pure 32Hz Ping, Sine Ping
- Group 5: digital, ikeda, minimal, data, fast-attack, long-decay, low (4)
  Members: Data Pulse, Data Pulse Narrow, Ikeda DC Blink, Zero Cross Thud
- Group 6: asmr, gentle, texture, ambient, fast-attack, long-decay, low (3)
  Members: Bubble Up, Soft Touch, Velvet Thump

### Drum Kick (drumKick)

- Group 1: digital, sharp, ikeda, 606, fast-attack, long-decay, low (8)
  Members: 606 Tick Kick, Airless Lab Kick, Broken DAC Kick, Click Kick, Ikeda Kick, Metal Box Kick, Needle Kick, Zero Attack Kick
- Group 2: punchy, analog, club, electro, fast-attack, long-decay, low (6)
  Members: 909 Plastic Punch, Compact Club Kick, Detroit Snap Kick, Electro Knock Kick, Gabber Micro Kick, Tight Punch
- Group 3: natural, organic, ambient, hand drum, fast-attack, long-decay, low (6)
  Members: Cajon, Djembe, Frame Drum, Heartbeat, Room Kick, Stomped Earth
- Group 4: analog, 808, classic, cr78, long-decay, low (4)
  Members: 808 Deep, CR78 Soft Kick, Clickless 808 Bloom, Tape Saturated Kick
- Group 5: ambient, atmospheric, deep, background, fast-attack, long-decay, low (4)
  Members: Ambient Boom, Distant Thunder, Ghost Pulse, Slow Bloom
- Group 6: idm, elastic, experimental, pitch, fast-attack, long-decay, low (4)
  Members: Elastic IDM Kick, FM Rubber Kick, IDM Origami Kick, Synare Drop Kick
- Group 7: asmr, gentle, soft, finger, fast-attack, long-decay, low (3)
  Members: Paper Thud, Pillow, Soft Tap

### Drum Click (drumClick)

- Group 1: digital, sharp, clock, minimal, fast-attack, long-decay (12)
  Members: Aliased Tap, Clock Divider 3, Clock Divider 5, Data Point, Micro Hit, Morse Dot, Noise Blend, Oscilloscope Tick, Smooth Transient, Spark, Static, Tick
- Group 2: digital, rim, clave, click, fast-attack, long-decay (9)
  Members: Broken DAC Rim, Combed Tick, Cyber Clave, Glitch, Needle Rim, Phase Cancel Pip, Rim Clave 808, Sample Hold Click, Zipper Tick
- Group 3: asmr, soft, tonal, bubble, fast-attack, long-decay (5)
  Members: Blip, Pop, Scratch, Tap, Tonal Wash
- Group 4: organic, natural, texture, wood, fast-attack, long-decay (5)
  Members: Crinkle, Seed Pod, Stone Tap, Twig Snap, Wood Dex Tick
- Group 5: ikeda, data, sparse, click, fast-attack, long-decay (4)
  Members: Continuous Data Tone, Dust, Sparse Data Grain, Stereo Micro Pair
- Group 6: ambient, delicate, minimal, water, fast-attack, long-decay (4)
  Members: Dewdrop, Distant Ping, Ice Crystal, Raindrop
- Group 7: granular, ambient, atmospheric, idm, fast-attack, long-decay (2)
  Members: Grain Scatter, Granular Pinwheel

### Drum Beep Hi (drumBeepHi)

- Group 1: digital, idm, bell, bright, fast-attack, long-decay, noisy (16)
  Members: Attack Transient, Bitcrushed Bell Atom, Chaos Ring, Circuit Ping, FM Bell, Feedback Tick, Folded Data Ping, Frozen FM Splinter, Gritty Metal, Inharmonic Clang Trio, Laser Glass, Metallic, Metallic Chirp, Micro Bell Spray, Raster Bell, Voltage Star
- Group 2: ambient, bell, organic, resonant, slow-attack, long-decay, bright (10)
  Members: Bamboo Knock, Bell, Chime, Frozen Bells, Glass, Glass Harmonica, Noisy Shimmer, Singing Bowl, Star Glint, Wind Chime
- Group 3: pure, ikeda, asmr, lab, slow-attack, long-decay, bright (7)
  Members: 8k Lab Pin, Crystal, Data Ping, Dry Lab Tone, Sine Microscope, Tink, Whistle
- Group 4: texture, nature, organic, ambient, slow-attack, long-decay, bright (4)
  Members: Bird Call, Insect Wing, Shimmer, Sparkle
- Group 5: opal, ratio, ade, bell, long-decay, noisy (3)
  Members: ADE Organ Hit, Detuned Fifth, Tubular Bell
- Group 6: needle, cluster, digital, experimental, fast-attack, long-decay, bright (2)
  Members: Harsh FM Needle, Needle Cluster
- Group 7: noise, decay, glitch, needle, fast-attack, long-decay, bright (2)
  Members: Noise Mod Needle, Noisy FM Pluck
- Group 8: digital, phase, stereo, null, fast-attack, long-decay, bright (2)
  Members: Phase Null Pip, Phase Shift Ping

### Drum Beep Lo (drumBeepLo)

- Group 1: digital, percussion, organic, acoustic, fast-attack, long-decay (13)
  Members: Autechre Gourd, Bloop, Chirp, Digital Tabla, Hollow Gourd, Kalimba, Kalimba Glitch, Low Carrier Pong, Pluck, Toybox Low Bleep, Tubby Data Tom, Wood FM Tock, Woody
- Group 2: modal, metal, tom, analog, fast-attack, long-decay (8)
  Members: 606 Low Tom, Gamelan Pair, Hollow FM Tom, Modal Cowbell, Pipe Knock, Struck Pipe, Synare Laser Tom, Tensioned Wire Tom
- Group 3: ambient, deep, natural, organic, slow-attack, long-decay (8)
  Members: Cave Drip, Frog Croak, Hollow Echo, Ping, Singing Metal, Soft Mallet, Tongue Drum, Underwater Ping
- Group 4: asmr, gentle, soft, ambient, slow-attack, long-decay (5)
  Members: Blip, Bubble, Droplet, Muted Tap, Soft Ping
- Group 5: modal, bell, metallic, bright, fast-attack, long-decay (4)
  Members: Bright Tilt Bell, Gamelan Tone, Modal Bell, Rubber Mallet
- Group 6: opal, cut, dark, dense, slow-attack, long-decay, low (2)
  Members: Compressed Gong, Dark Cut Thud
- Group 7: marimba, bar, modal, opal, long-decay (2)
  Members: Spread Marimba, Struck Bar

### Drum Noise (drumNoise)

- Group 1: ambient, nature, organic, texture, slow-attack, long-decay, bright (11)
  Members: Bonfire Crackle, Distant Surf, Forest Ambience, Leaf Crunch, Ocean Spray, Rain Patter, Sand Shuffle, Static Rim Wash, Tape Hiss, Texture, Wind Gust
- Group 2: hat, analog, 808, 909, fast-attack, long-decay, bright (9)
  Members: 606 Paper Hat, 808 Closed Hat, 808 Open Hat, 909 Clap Snap, 909 Closed Hat, 909 Open Hat, CR78 Metallic Hat, Lab Clap 808, Zipper Hat
- Group 3: particle, random, opal, rain, slow-attack, long-decay, bright (9)
  Members: Chaotic Scatter, Dust, Dust Particles, Jittery Dust, Ratchet Rain, Ratchet Rain II, Sand Ratchet, Sparse Particle Burst, Stochastic Rain
- Group 4: bright, electronic, percussion, bitcrush, long-decay, noisy (6)
  Members: Bitcrushed Cymbal Spray, Closed Insect Hat, Hi-Hat, Hiss, Shaker, Static
- Group 5: asmr, texture, soft, air, slow-attack, long-decay, bright (6)
  Members: Breath, Grain Cloud, Rustle, Steam, Whisper, White Mist
- Group 6: digital, hat, ikeda, noise, long-decay, bright, noisy (5)
  Members: Cold Noise Dot, Comb Noise Tick, Highpass Needle Hat, Notch Digital Hat, Scrape
- Group 7: opal, ratchet, percussive, burst, long-decay, bright, noisy (4)
  Members: 808 Clap, Flam Snare, Micro Scatter, Ratchet Burst
- Group 8: dust, granular, idm, snare, fast-attack, long-decay, bright (1)
  Members: Granular Dust Snare

### Drum Membrane (drumMembrane)

- Group 1: snare, ambient, brush, ghost, slow-attack, long-decay (9)
  Members: 606 Snare Paper, 808 Snare Wire, Brush Data Snare, Brush Swirl, Ghost Snare, Plastic Pail Clap, Rattle Shaker, Skin Dot, Wire Buzz Ghost
- Group 2: ethnic, snare, tonal, classic, long-decay (9)
  Members: Djembe, Frame Drum, High Tom, Loose Snare, Modal IDM Snare, Plastic Bucket, Snare Classic, Tabla, Wood Block
- Group 3: tom, skin, tuned, deep, fast-attack, long-decay (5)
  Members: Floor Tom, Simmons Laser Tom, Tuned Skin Tom High, Tuned Skin Tom Low, Tuned Skin Tom Mid
- Group 4: bright, glass, metal, ambient, long-decay (5)
  Members: Glass Bowl, Glass Plate Hit, Metal Insect Snare, Metal Sheet, Rain on Tin
- Group 5: snare, marching, punchy, tight, fast-attack, long-decay (4)
  Members: 909 Snare Plastic, Marching Snare, Tight Marching 2, Tight Snare
- Group 6: ambient, deep, ethereal, sustain, slow-attack, long-decay (2)
  Members: Distant Thunder, Ethereal Skin
- Group 7: bowl, meditation, metal, singing, slow-attack, long-decay (2)
  Members: Singing Bowl, Singing Wire Bowl

## Notes

- The deletion clusters are candidates, not automatic delete recommendations. Audition each cluster because small parameter distance can still matter musically.
- The JSON companion file contains latest resolved payload hashes, closest pairs, candidate clusters, and meta groups.
