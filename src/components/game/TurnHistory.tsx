import React from 'react';
import { useGameStore, TurnHistoryEntry } from '../../store/game';

export const TurnHistory: React.FC = () => {
  const turnHistory = useGameStore((state) => state.turnHistory);

  if (turnHistory.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Turn History</h3>
        <div className="text-gray-500 text-sm italic">
          Game has not started yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Turn History <span className="text-xs text-gray-500 font-normal">(latest first)</span></h3>
      <div className="max-h-64 overflow-y-auto space-y-2">
        {turnHistory.slice().reverse().map((entry) => (
          <div key={entry.id} className="border-l-2 border-blue-500 pl-3 pb-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-gray-700">
                Turn {entry.turnNumber}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(entry.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            <div className="text-sm text-gray-600 mt-1">
              <span className="font-medium text-blue-600">{entry.playerName}</span>
              <span className="text-gray-700"> {entry.description}</span>
            </div>
            {entry.action && (
              <div className="text-xs text-gray-500 mt-1 bg-gray-50 px-2 py-1 rounded">
                Action: {entry.action}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};