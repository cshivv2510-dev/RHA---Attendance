#!/usr/bin/env python3
"""Generate simple scan feedback sounds as WAV files."""
import struct, math, wave, os

def gen_tone(filename, freqs, duration=0.15, sample_rate=44100, volume=0.5):
    """Generate a multi-tone WAV file."""
    n_samples = int(sample_rate * duration)
    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        value = 0
        for freq in freqs:
            value += math.sin(2 * math.pi * freq * t)
        value /= len(freqs)
        # Apply fade-in/fade-out envelope
        fade = min(i / (sample_rate * 0.01), 1.0) * min((n_samples - i) / (sample_rate * 0.02), 1.0)
        value *= fade * volume
        samples.append(int(value * 32767))

    with wave.open(filename, 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        f.writeframes(struct.pack(f'<{len(samples)}h', *samples))

os.makedirs('public/sounds', exist_ok=True)

# Success: pleasant ascending two-tone chime (C5 + E5)
gen_tone('public/sounds/success.mp3', [523, 659], duration=0.2, volume=0.4)

# Error: lower buzzy tone (A3 + slightly detuned)
gen_tone('public/sounds/error.mp3', [220, 233], duration=0.25, volume=0.3)

print("✅ Sound files generated")
