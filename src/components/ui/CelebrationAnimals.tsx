import React from 'react';

interface AnimalProps {
  size?: number;
  className?: string;
}

export const FlyingZebra: React.FC<AnimalProps> = ({ size = 120, className = '' }) => (
  <svg 
    width={size} 
    height={size * 0.8} 
    viewBox="0 0 120 96" 
    className={className}
  >
    {/* Zebra body */}
    <ellipse cx="60" cy="55" rx="35" ry="20" fill="#f0f0f0" stroke="#000" strokeWidth="2"/>
    
    {/* Zebra stripes on body */}
    <path d="M30 45 Q60 40 90 45" stroke="#000" strokeWidth="3" fill="none"/>
    <path d="M32 55 Q60 50 88 55" stroke="#000" strokeWidth="3" fill="none"/>
    <path d="M35 65 Q60 60 85 65" stroke="#000" strokeWidth="3" fill="none"/>
    
    {/* Zebra head */}
    <ellipse cx="45" cy="35" rx="18" ry="15" fill="#f0f0f0" stroke="#000" strokeWidth="2"/>
    
    {/* Head stripes */}
    <path d="M32 25 Q45 22 58 25" stroke="#000" strokeWidth="2" fill="none"/>
    <path d="M35 35 Q45 32 55 35" stroke="#000" strokeWidth="2" fill="none"/>
    <path d="M37 45 Q45 42 53 45" stroke="#000" strokeWidth="2" fill="none"/>
    
    {/* Ears */}
    <ellipse cx="38" cy="22" rx="4" ry="8" fill="#f0f0f0" stroke="#000" strokeWidth="2"/>
    <ellipse cx="52" cy="22" rx="4" ry="8" fill="#f0f0f0" stroke="#000" strokeWidth="2"/>
    
    {/* Eyes */}
    <circle cx="40" cy="30" r="3" fill="#000"/>
    <circle cx="50" cy="30" r="3" fill="#000"/>
    <circle cx="41" cy="29" r="1" fill="#fff"/>
    <circle cx="51" cy="29" r="1" fill="#fff"/>
    
    {/* Mane */}
    <path d="M35 15 Q40 10 45 15 Q50 10 55 15" stroke="#000" strokeWidth="3" fill="none"/>
    
    {/* Legs */}
    <rect x="38" y="70" width="4" height="15" fill="#f0f0f0" stroke="#000" strokeWidth="1"/>
    <rect x="48" y="70" width="4" height="15" fill="#f0f0f0" stroke="#000" strokeWidth="1"/>
    <rect x="68" y="70" width="4" height="15" fill="#f0f0f0" stroke="#000" strokeWidth="1"/>
    <rect x="78" y="70" width="4" height="15" fill="#f0f0f0" stroke="#000" strokeWidth="1"/>
    
    {/* Hooves */}
    <ellipse cx="40" cy="87" rx="3" ry="2" fill="#333"/>
    <ellipse cx="50" cy="87" rx="3" ry="2" fill="#333"/>
    <ellipse cx="70" cy="87" rx="3" ry="2" fill="#333"/>
    <ellipse cx="80" cy="87" rx="3" ry="2" fill="#333"/>
    
    {/* Tail */}
    <path d="M95 55 Q105 45 100 30" stroke="#000" strokeWidth="3" fill="none"/>
    <circle cx="100" cy="28" r="4" fill="#000"/>
    
    {/* Wings */}
    <ellipse cx="35" cy="45" rx="15" ry="8" fill="#87CEEB" opacity="0.7" stroke="#4169E1" strokeWidth="2"/>
    <ellipse cx="85" cy="45" rx="15" ry="8" fill="#87CEEB" opacity="0.7" stroke="#4169E1" strokeWidth="2"/>
    
    {/* Wing details */}
    <path d="M25 45 Q35 40 45 45" stroke="#4169E1" strokeWidth="1" fill="none"/>
    <path d="M75 45 Q85 40 95 45" stroke="#4169E1" strokeWidth="1" fill="none"/>
  </svg>
);

export const FlyingUnicorn: React.FC<AnimalProps> = ({ size = 120, className = '' }) => (
  <svg 
    width={size} 
    height={size * 0.8} 
    viewBox="0 0 120 96" 
    className={className}
  >
    {/* Unicorn body */}
    <ellipse cx="60" cy="55" rx="35" ry="20" fill="#fff" stroke="#ddd" strokeWidth="2"/>
    
    {/* Unicorn head */}
    <ellipse cx="45" cy="35" rx="18" ry="15" fill="#fff" stroke="#ddd" strokeWidth="2"/>
    
    {/* Horn */}
    <path d="M45 15 L47 5 L43 5 Z" fill="#FFD700" stroke="#FFA500" strokeWidth="1"/>
    <path d="M43 12 Q45 10 47 12" stroke="#FFA500" strokeWidth="1" fill="none"/>
    <path d="M43.5 9 Q45 7.5 46.5 9" stroke="#FFA500" strokeWidth="1" fill="none"/>
    
    {/* Ears */}
    <ellipse cx="38" cy="22" rx="4" ry="8" fill="#fff" stroke="#ddd" strokeWidth="2"/>
    <ellipse cx="52" cy="22" rx="4" ry="8" fill="#fff" stroke="#ddd" strokeWidth="2"/>
    
    {/* Eyes */}
    <circle cx="40" cy="30" r="3" fill="#000"/>
    <circle cx="50" cy="30" r="3" fill="#000"/>
    <circle cx="41" cy="29" r="1" fill="#fff"/>
    <circle cx="51" cy="29" r="1" fill="#fff"/>
    
    {/* Mane - rainbow colored */}
    <path d="M35 15 Q40 10 45 15" stroke="#FF69B4" strokeWidth="4" fill="none"/>
    <path d="M37 18 Q42 13 47 18" stroke="#FF1493" strokeWidth="3" fill="none"/>
    <path d="M39 21 Q44 16 49 21" stroke="#9370DB" strokeWidth="3" fill="none"/>
    <path d="M50 15 Q55 10 60 15" stroke="#00CED1" strokeWidth="4" fill="none"/>
    <path d="M52 18 Q57 13 62 18" stroke="#00BFFF" strokeWidth="3" fill="none"/>
    
    {/* Legs */}
    <rect x="38" y="70" width="4" height="15" fill="#fff" stroke="#ddd" strokeWidth="1"/>
    <rect x="48" y="70" width="4" height="15" fill="#fff" stroke="#ddd" strokeWidth="1"/>
    <rect x="68" y="70" width="4" height="15" fill="#fff" stroke="#ddd" strokeWidth="1"/>
    <rect x="78" y="70" width="4" height="15" fill="#fff" stroke="#ddd" strokeWidth="1"/>
    
    {/* Hooves - golden */}
    <ellipse cx="40" cy="87" rx="3" ry="2" fill="#FFD700"/>
    <ellipse cx="50" cy="87" rx="3" ry="2" fill="#FFD700"/>
    <ellipse cx="70" cy="87" rx="3" ry="2" fill="#FFD700"/>
    <ellipse cx="80" cy="87" rx="3" ry="2" fill="#FFD700"/>
    
    {/* Tail - rainbow */}
    <path d="M95 55 Q105 45 100 30" stroke="#FF69B4" strokeWidth="4" fill="none"/>
    <path d="M96 53 Q106 43 101 28" stroke="#9370DB" strokeWidth="3" fill="none"/>
    <path d="M97 51 Q107 41 102 26" stroke="#00CED1" strokeWidth="2" fill="none"/>
    
    {/* Wings - iridescent */}
    <ellipse cx="35" cy="45" rx="15" ry="8" fill="url(#unicornGradient)" opacity="0.8" stroke="#FF69B4" strokeWidth="2"/>
    <ellipse cx="85" cy="45" rx="15" ry="8" fill="url(#unicornGradient)" opacity="0.8" stroke="#FF69B4" strokeWidth="2"/>
    
    {/* Wing details */}
    <path d="M25 45 Q35 40 45 45" stroke="#FF1493" strokeWidth="1" fill="none"/>
    <path d="M75 45 Q85 40 95 45" stroke="#FF1493" strokeWidth="1" fill="none"/>
    
    {/* Gradient definition */}
    <defs>
      <linearGradient id="unicornGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF69B4" stopOpacity="0.8"/>
        <stop offset="50%" stopColor="#9370DB" stopOpacity="0.6"/>
        <stop offset="100%" stopColor="#00CED1" stopOpacity="0.8"/>
      </linearGradient>
    </defs>
  </svg>
);

export const FlyingSloth: React.FC<AnimalProps> = ({ size = 120, className = '' }) => (
  <svg 
    width={size} 
    height={size * 0.8} 
    viewBox="0 0 120 96" 
    className={className}
  >
    {/* Sloth body */}
    <ellipse cx="60" cy="55" rx="32" ry="18" fill="#8B4513" stroke="#654321" strokeWidth="2"/>
    
    {/* Belly */}
    <ellipse cx="60" cy="58" rx="20" ry="12" fill="#DEB887"/>
    
    {/* Sloth head */}
    <ellipse cx="45" cy="38" rx="16" ry="18" fill="#8B4513" stroke="#654321" strokeWidth="2"/>
    
    {/* Face */}
    <ellipse cx="45" cy="42" rx="10" ry="12" fill="#DEB887"/>
    
    {/* Eyes - sleepy */}
    <ellipse cx="41" cy="35" rx="2" ry="1" fill="#000"/>
    <ellipse cx="49" cy="35" rx="2" ry="1" fill="#000"/>
    
    {/* Nose */}
    <ellipse cx="45" cy="40" rx="1.5" ry="1" fill="#000"/>
    
    {/* Mouth - sleepy smile */}
    <path d="M42 44 Q45 46 48 44" stroke="#000" strokeWidth="2" fill="none"/>
    
    {/* Arms - long and dangly */}
    <ellipse cx="30" cy="50" rx="3" ry="12" fill="#8B4513" stroke="#654321" strokeWidth="1"/>
    <ellipse cx="90" cy="50" rx="3" ry="12" fill="#8B4513" stroke="#654321" strokeWidth="1"/>
    
    {/* Hands with claws */}
    <ellipse cx="30" cy="62" rx="4" ry="3" fill="#8B4513"/>
    <ellipse cx="90" cy="62" rx="4" ry="3" fill="#8B4513"/>
    <path d="M27 60 L25 58" stroke="#654321" strokeWidth="2"/>
    <path d="M30 59 L28 57" stroke="#654321" strokeWidth="2"/>
    <path d="M33 60 L35 58" stroke="#654321" strokeWidth="2"/>
    <path d="M87 60 L85 58" stroke="#654321" strokeWidth="2"/>
    <path d="M90 59 L88 57" stroke="#654321" strokeWidth="2"/>
    <path d="M93 60 L95 58" stroke="#654321" strokeWidth="2"/>
    
    {/* Legs */}
    <ellipse cx="50" cy="72" rx="3" ry="8" fill="#8B4513" stroke="#654321" strokeWidth="1"/>
    <ellipse cx="70" cy="72" rx="3" ry="8" fill="#8B4513" stroke="#654321" strokeWidth="1"/>
    
    {/* Feet */}
    <ellipse cx="50" cy="82" rx="4" ry="3" fill="#8B4513"/>
    <ellipse cx="70" cy="82" rx="4" ry="3" fill="#8B4513"/>
    
    {/* Wings - comically small */}
    <ellipse cx="35" cy="45" rx="8" ry="4" fill="#87CEEB" opacity="0.8" stroke="#4169E1" strokeWidth="2"/>
    <ellipse cx="85" cy="45" rx="8" ry="4" fill="#87CEEB" opacity="0.8" stroke="#4169E1" strokeWidth="2"/>
    
    {/* Wing flapping lines for comedy */}
    <path d="M30 42 Q32 40 34 42" stroke="#4169E1" strokeWidth="1" fill="none" opacity="0.5"/>
    <path d="M86 42 Q88 40 90 42" stroke="#4169E1" strokeWidth="1" fill="none" opacity="0.5"/>
    
    {/* Fur texture */}
    <path d="M40 30 Q42 28 44 30" stroke="#654321" strokeWidth="1" fill="none"/>
    <path d="M46 32 Q48 30 50 32" stroke="#654321" strokeWidth="1" fill="none"/>
    <path d="M35 50 Q40 48 45 50" stroke="#654321" strokeWidth="1" fill="none"/>
    <path d="M75 50 Q80 48 85 50" stroke="#654321" strokeWidth="1" fill="none"/>
    
    {/* Sleepy Z's */}
    <text x="65" y="25" fill="#4169E1" fontSize="12" fontFamily="Arial" opacity="0.7">Z</text>
    <text x="70" y="20" fill="#4169E1" fontSize="10" fontFamily="Arial" opacity="0.5">z</text>
    <text x="75" y="15" fill="#4169E1" fontSize="8" fontFamily="Arial" opacity="0.3">z</text>
  </svg>
);

export type CelebrationAnimal = 'zebra' | 'unicorn' | 'sloth';

export const getRandomAnimal = (): CelebrationAnimal => {
  const animals: CelebrationAnimal[] = ['zebra', 'unicorn', 'sloth'];
  return animals[Math.floor(Math.random() * animals.length)];
};

export const CelebrationAnimal: React.FC<AnimalProps & { animal: CelebrationAnimal }> = ({ 
  animal, 
  size, 
  className 
}) => {
  switch (animal) {
    case 'zebra':
      return <FlyingZebra size={size} className={className} />;
    case 'unicorn':
      return <FlyingUnicorn size={size} className={className} />;
    case 'sloth':
      return <FlyingSloth size={size} className={className} />;
    default:
      return <FlyingUnicorn size={size} className={className} />;
  }
};