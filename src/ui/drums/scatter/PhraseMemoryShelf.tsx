import React from 'react';
import type { GeneratedDrumPhrase } from './scatterTypes';
import PhraseGlyphCard from './PhraseGlyphCard';

interface PhraseMemoryShelfProps {
  phrases: GeneratedDrumPhrase[];
  onPrint: (phrase: GeneratedDrumPhrase) => void;
  onPin: (phrase: GeneratedDrumPhrase) => void;
  onMutate: (phrase: GeneratedDrumPhrase) => void;
}

const PhraseMemoryShelf: React.FC<PhraseMemoryShelfProps> = ({ phrases, onPrint, onPin, onMutate }) => (
  <div className="scatter-phrase-shelf">
    {phrases.length === 0 ? (
      Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="scatter-phrase-empty" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))
    ) : phrases.map((phrase) => (
      <PhraseGlyphCard
        key={phrase.id}
        phrase={phrase}
        onPrint={() => onPrint(phrase)}
        onPin={() => onPin(phrase)}
        onMutate={() => onMutate(phrase)}
      />
    ))}
  </div>
);

export default PhraseMemoryShelf;
