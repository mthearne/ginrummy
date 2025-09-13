import React, { useState, useEffect } from 'react';

interface ScoreData {
  knockerScore: number;
  opponentScore: number;
  knockerDeadwood: number;
  opponentDeadwoodBefore: number;
  opponentDeadwoodAfter: number;
  layOffValue: number;
  isUndercut: boolean;
  isGin: boolean;
}

interface ScoreCalculatorProps {
  scoreData: ScoreData;
  showBreakdown: boolean;
  phase: string;
}

export const ScoreCalculator: React.FC<ScoreCalculatorProps> = ({
  scoreData,
  showBreakdown,
  phase,
}) => {
  const [animationStep, setAnimationStep] = useState(0);
  const [displayNumbers, setDisplayNumbers] = useState({
    knockerDeadwood: 0,
    opponentDeadwoodBefore: 0,
    opponentDeadwoodAfter: 0,
    layOffValue: 0,
    finalKnockerScore: 0,
    finalOpponentScore: 0,
  });

  useEffect(() => {
    if (showBreakdown) {
      // Animate number counting
      const animateNumbers = async () => {
        // Step 1: Show initial deadwood
        await animateNumber('knockerDeadwood', scoreData.knockerDeadwood, 800);
        setAnimationStep(1);
        
        await animateNumber('opponentDeadwoodBefore', scoreData.opponentDeadwoodBefore, 800);
        setAnimationStep(2);
        
        // Step 2: Show lay-off reduction if any
        if (scoreData.layOffValue > 0) {
          await animateNumber('layOffValue', scoreData.layOffValue, 600);
          setAnimationStep(3);
          
          await animateNumber('opponentDeadwoodAfter', scoreData.opponentDeadwoodAfter, 800);
          setAnimationStep(4);
        }
        
        // Step 3: Calculate final scores
        await new Promise(resolve => setTimeout(resolve, 500));
        setAnimationStep(5);
        
        await animateNumber('finalKnockerScore', scoreData.knockerScore, 1000);
        await animateNumber('finalOpponentScore', scoreData.opponentScore, 1000);
        setAnimationStep(6);
      };

      animateNumbers();
    }
  }, [showBreakdown, scoreData]);

  const animateNumber = (key: keyof typeof displayNumbers, target: number, duration: number): Promise<void> => {
    return new Promise((resolve) => {
      const start = displayNumbers[key];
      const difference = target - start;
      const startTime = Date.now();

      const updateNumber = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = start + (difference * easeOutCubic(progress));

        setDisplayNumbers(prev => ({
          ...prev,
          [key]: Math.round(current)
        }));

        if (progress < 1) {
          requestAnimationFrame(updateNumber);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(updateNumber);
    });
  };

  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  if (!showBreakdown) {
    return (
      <div className="text-center py-8">
        <div className="text-lg text-gray-600">Calculating scores...</div>
        <div className="mt-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
      <h3 className="text-xl font-bold text-center text-gray-800">Score Breakdown</h3>
      
      {/* Deadwood Display */}
      <div className="space-y-3">
        <div className={`flex justify-between items-center p-3 rounded transition-all duration-500 ${
          animationStep >= 1 ? 'bg-blue-100 opacity-100' : 'opacity-0'
        }`}>
          <span className="font-medium">Knocker Deadwood:</span>
          <span className="text-lg font-bold text-blue-600">
            {displayNumbers.knockerDeadwood} points
          </span>
        </div>

        <div className={`flex justify-between items-center p-3 rounded transition-all duration-500 ${
          animationStep >= 2 ? 'bg-purple-100 opacity-100' : 'opacity-0'
        }`}>
          <span className="font-medium">Opponent Deadwood:</span>
          <span className="text-lg font-bold text-purple-600">
            {scoreData.layOffValue > 0 && animationStep >= 4 ? (
              <div className="flex items-center space-x-2">
                <span className="line-through text-gray-400">
                  {displayNumbers.opponentDeadwoodBefore}
                </span>
                <span>→</span>
                <span>{displayNumbers.opponentDeadwoodAfter} points</span>
              </div>
            ) : (
              `${displayNumbers.opponentDeadwoodBefore} points`
            )}
          </span>
        </div>

        {scoreData.layOffValue > 0 && (
          <div className={`flex justify-between items-center p-3 rounded transition-all duration-500 ${
            animationStep >= 3 ? 'bg-green-100 opacity-100' : 'opacity-0'
          }`}>
            <span className="font-medium">Cards Laid Off:</span>
            <span className="text-lg font-bold text-green-600">
              -{displayNumbers.layOffValue} points
            </span>
          </div>
        )}
      </div>

      {/* Calculation */}
      {animationStep >= 5 && (
        <div className="border-t pt-4 space-y-2">
          <div className="text-center text-sm text-gray-600 mb-3">
            {scoreData.isGin ? (
              <div className="text-yellow-600 font-bold">🎯 GIN BONUS: +25 points!</div>
            ) : scoreData.isUndercut ? (
              <div className="text-red-600 font-bold">⚡ UNDERCUT BONUS: +25 points!</div>
            ) : (
              <div>Difference: {scoreData.opponentDeadwoodAfter} - {scoreData.knockerDeadwood}</div>
            )}
          </div>

          <div className="flex justify-between text-xl font-bold">
            <div className={`${scoreData.knockerScore > 0 ? 'text-green-600' : 'text-gray-400'}`}>
              Knocker: +{displayNumbers.finalKnockerScore}
            </div>
            <div className={`${scoreData.opponentScore > 0 ? 'text-green-600' : 'text-gray-400'}`}>
              Opponent: +{displayNumbers.finalOpponentScore}
            </div>
          </div>
        </div>
      )}

      {/* Winner Declaration */}
      {animationStep >= 6 && (
        <div className="text-center py-4">
          <div className={`text-2xl font-bold animate-bounce ${
            scoreData.knockerScore > scoreData.opponentScore
              ? 'text-blue-600'
              : scoreData.opponentScore > scoreData.knockerScore
              ? 'text-purple-600'
              : 'text-gray-600'
          }`}>
            {scoreData.knockerScore > scoreData.opponentScore ? (
              scoreData.isGin ? '🎯 GIN VICTORY!' : '👊 KNOCKER WINS!'
            ) : scoreData.opponentScore > scoreData.knockerScore ? (
              scoreData.isUndercut ? '⚡ UNDERCUT!' : '🛡️ DEFENDER WINS!'
            ) : (
              '🤝 TIE GAME!'
            )}
          </div>
        </div>
      )}
    </div>
  );
};