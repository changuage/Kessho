import matplotlib.pyplot as plt
import numpy as np

# Scale definitions with their tension values
scales = [
    ('E Major', 0.00, 'consonant'),
    ('E Major Pent', 0.03, 'consonant'),
    ('E Lydian', 0.10, 'consonant'),
    ('E Mixolydian', 0.18, 'consonant'),
    ('E Minor Pent', 0.22, 'consonant'),
    ('E Dorian', 0.25, 'consonant'),
    ('E Aeolian', 0.35, 'color'),
    ('E Harmonic Min', 0.50, 'color'),
    ('E Melodic Min', 0.55, 'color'),
    ('E Octatonic', 0.85, 'high'),
    ('E Phrygian Dom', 0.90, 'high'),
]

def get_tension_band(tension):
    """Get scales available at a given tension level"""
    if tension <= 0.25:
        return [s for s in scales if s[2] == 'consonant']
    elif tension <= 0.55:
        return [s for s in scales if s[2] in ['consonant', 'color']]
    elif tension <= 0.80:
        return [s for s in scales if s[2] in ['color', 'high']]
    else:
        return [s for s in scales if s[2] == 'high']

def calculate_probabilities(tension):
    """Calculate probability of each scale at a given tension"""
    candidates = get_tension_band(tension)
    
    weights = {}
    for name, tension_val, _ in candidates:
        distance = abs(tension_val - tension)
        weight = 1 / (distance + 0.1)
        weights[name] = weight
    
    total = sum(weights.values())
    probs = {name: w / total for name, w in weights.items()}
    
    # Return probs for all scales (0 for unavailable)
    result = {}
    for name, _, _ in scales:
        result[name] = probs.get(name, 0)
    return result

# Generate tension values
tensions = np.linspace(0, 1, 200)

# Calculate probabilities for each tension
prob_data = {name: [] for name, _, _ in scales}
for t in tensions:
    probs = calculate_probabilities(t)
    for name in prob_data:
        prob_data[name].append(probs[name] * 100)  # Convert to percentage

# Create the plot
fig, ax = plt.subplots(figsize=(14, 8))

# Color scheme
colors = {
    'E Major': '#2ecc71',
    'E Major Pent': '#27ae60',
    'E Lydian': '#3498db',
    'E Mixolydian': '#9b59b6',
    'E Minor Pent': '#e74c3c',
    'E Dorian': '#e67e22',
    'E Aeolian': '#1abc9c',
    'E Harmonic Min': '#f39c12',
    'E Melodic Min': '#d35400',
    'E Octatonic': '#8e44ad',
    'E Phrygian Dom': '#c0392b',
}

# Plot each scale
for name, _, _ in scales:
    ax.plot(tensions, prob_data[name], label=name, color=colors[name], linewidth=2)

# Add vertical lines for band boundaries
ax.axvline(x=0.25, color='gray', linestyle='--', alpha=0.5, label='_nolegend_')
ax.axvline(x=0.55, color='gray', linestyle='--', alpha=0.5, label='_nolegend_')
ax.axvline(x=0.80, color='gray', linestyle='--', alpha=0.5, label='_nolegend_')

# Add band labels
ax.text(0.125, 52, 'Consonant', ha='center', fontsize=10, color='gray')
ax.text(0.40, 52, 'Consonant + Color', ha='center', fontsize=10, color='gray')
ax.text(0.675, 52, 'Color + High', ha='center', fontsize=10, color='gray')
ax.text(0.90, 52, 'High', ha='center', fontsize=10, color='gray')

# Formatting
ax.set_xlabel('Tension Value', fontsize=12)
ax.set_ylabel('Probability (%)', fontsize=12)
ax.set_title('Scale Selection Probability by Tension', fontsize=14, fontweight='bold')
ax.set_xlim(0, 1)
ax.set_ylim(0, 55)
ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1), fontsize=9)
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('tension_scale_probability.png', dpi=150, bbox_inches='tight')
print('Saved: tension_scale_probability.png')
plt.show()
