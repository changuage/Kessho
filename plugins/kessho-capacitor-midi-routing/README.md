# Kessho Capacitor MIDI Routing

Local Capacitor plugin that gives the Kessho Capacitor iOS shell a native
CoreMIDI input bridge. It discovers iOS MIDI sources, connects selected inputs,
and emits normalized MIDI messages to the React routing layer.

The React side keeps the actual parameter binding profile so the same UI can
apply MIDI CC, note velocity, pressure, and pitch-bend data to Kessho state
without changing the web audio fallback.
