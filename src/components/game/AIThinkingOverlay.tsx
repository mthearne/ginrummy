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
    <div className="fixed inset-0 bg-black bg-opacity-20 z-50 flex items-center justify-center pointer-events-none">
      {/* Position over AI's cards area */}
      <div className="absolute top-8 right-8 bg-white bg-opacity-95 backdrop-blur-sm rounded-lg shadow-lg p-4 max-w-sm border border-gray-200">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-gray-700">AI Thinking...</span>
        </div>
        
        <div className="text-sm text-gray-800 min-h-[1.5rem]">
          {displayedText}
          {isTyping && <span className="animate-pulse">|</span>}
        </div>
        
        {/* Progress indicator */}
        <div className="mt-3 flex space-x-1">
          {aiThoughts.map((_, index) => (
            <div
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
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