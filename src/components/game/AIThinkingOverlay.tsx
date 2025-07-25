'use client';

import { useGameStore } from '../../store/game';
import { useEffect, useState } from 'react';

export default function AIThinkingOverlay() {
  const { isAIThinking, aiThoughts } = useGameStore();
  const [currentThoughtIndex, setCurrentThoughtIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!isAIThinking || aiThoughts.length === 0) {
      setCurrentThoughtIndex(0);
      setDisplayedText('');
      setIsTyping(false);
      return;
    }

    let thoughtTimer: NodeJS.Timeout;
    let typingTimer: NodeJS.Timeout;

    const showNextThought = () => {
      if (currentThoughtIndex < aiThoughts.length) {
        setIsTyping(true);
        setDisplayedText('');

        // Typing animation
        const thought = aiThoughts[currentThoughtIndex];
        let charIndex = 0;
        
        const typeChar = () => {
          if (charIndex < thought.length) {
            setDisplayedText(thought.substring(0, charIndex + 1));
            charIndex++;
            typingTimer = setTimeout(typeChar, 30); // 30ms per character
          } else {
            setIsTyping(false);
            // Wait before showing next thought
            thoughtTimer = setTimeout(() => {
              setCurrentThoughtIndex(prev => prev + 1);
            }, 800); // 800ms pause between thoughts
          }
        };

        typeChar();
      }
    };

    showNextThought();

    return () => {
      clearTimeout(thoughtTimer);
      clearTimeout(typingTimer);
    };
  }, [isAIThinking, aiThoughts, currentThoughtIndex]);

  if (!isAIThinking) {
    return null;
  }

  return (
    <div className="absolute top-2 right-2 z-50 pointer-events-none">
      {/* Thinking bubble positioned over AI's card area */}
      <div className="bg-white bg-opacity-95 backdrop-blur-sm rounded-lg shadow-lg p-3 max-w-xs border border-gray-200">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-gray-700">AI Thinking...</span>
        </div>
        
        <div className="text-xs text-gray-800 min-h-[1rem]">
          {displayedText}
          {isTyping && <span className="animate-pulse">|</span>}
        </div>
        
        {/* Progress indicator */}
        <div className="mt-2 flex space-x-1">
          {aiThoughts.map((_, index) => (
            <div
              key={index}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                index < currentThoughtIndex 
                  ? 'bg-blue-500' 
                  : index === currentThoughtIndex 
                  ? 'bg-blue-300' 
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}